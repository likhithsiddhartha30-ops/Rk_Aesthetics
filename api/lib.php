<?php
/**
 * Shared plumbing: config, database, JSON replies, signatures.
 * Every endpoint starts by requiring this file.
 */

define('RK_APP', true);

/* Errors go to the log, never to the browser: a stack trace in a JSON
   response tells an attacker where everything lives. */
ini_set('display_errors', '0');
error_reporting(E_ALL);

function cfg(string $key = null)
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/config.php';
        if (!file_exists($path)) {
            json_out(['error' => 'The shop is not configured yet'], 500);
        }
        $config = require $path;
    }
    return $key === null ? $config : ($config[$key] ?? null);
}

/* ---------------- responses ---------------- */

function cors_headers(): void
{
    $origin = cfg('allowed_origin') ?: '*';
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Vary: Origin');
}

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* Logs the detail, tells the buyer only what helps them. */
function fail(string $message, int $status = 400, string $logDetail = ''): void
{
    if ($logDetail !== '') {
        error_log('[rk-api] ' . $logDetail);
    }
    $body = ['error' => $message];
    if (cfg('debug') && $logDetail !== '') {
        $body['debug'] = $logDetail;
    }
    json_out($body, $status);
}

/* Every endpoint is POST + JSON, and answers the browser's preflight. */
function begin_json_request(): array
{
    cors_headers();
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fail('Method not allowed', 405);
    }
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        fail('Expected a JSON body', 400);
    }
    return $body;
}

/* ---------------- database ---------------- */

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = cfg('dsn');
    if (str_starts_with($dsn, 'sqlite:')) {
        $file = substr($dsn, 7);
        $dir = dirname($file);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            fail('Storage is not writable', 500, 'cannot create ' . $dir);
        }
    }

    try {
        $pdo = new PDO($dsn, cfg('user'), cfg('pass'), [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (Throwable $e) {
        fail('Something went wrong', 500, 'db connect: ' . $e->getMessage());
    }

    if (str_starts_with($dsn, 'sqlite:')) {
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
    }

    migrate($pdo);
    return $pdo;
}

/* Creates the tables on first use. Written to run on both SQLite and
   MySQL, so ids are strings we generate rather than auto-increments. */
function migrate(PDO $pdo): void
{
    $statements = [
        'CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price_inr INTEGER NOT NULL,
            old_price_inr INTEGER NULL,
            is_bundle INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0
        )',
        'CREATE TABLE IF NOT EXISTS product_files (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            storage_file TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )',
        'CREATE TABLE IF NOT EXISTS bundle_items (
            bundle_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            PRIMARY KEY (bundle_id, product_id)
        )',
        'CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            order_number TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            full_name TEXT NOT NULL,
            phone TEXT NULL,
            city TEXT NULL,
            state TEXT NULL,
            gstin TEXT NULL,
            notes TEXT NULL,
            status TEXT NOT NULL DEFAULT \'created\',
            subtotal_inr INTEGER NOT NULL,
            total_inr INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT \'INR\',
            provider_order_id TEXT NULL,
            provider_payment_id TEXT NULL,
            provider_state TEXT NULL,
            paid_at TEXT NULL,
            created_at TEXT NOT NULL
        )',
        'CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            unit_price_inr INTEGER NOT NULL
        )',
        'CREATE TABLE IF NOT EXISTS download_events (
            id TEXT PRIMARY KEY,
            order_id TEXT NULL,
            file_id TEXT NULL,
            ip TEXT NULL,
            user_agent TEXT NULL,
            created_at TEXT NOT NULL
        )',
        'CREATE TABLE IF NOT EXISTS app_cache (
            cache_key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )',
        'CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders (provider_order_id)',
        'CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (email)',
        'CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id)',
        'CREATE INDEX IF NOT EXISTS idx_files_product ON product_files (product_id)',
    ];

    foreach ($statements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            fail('Something went wrong', 500, 'migrate: ' . $e->getMessage());
        }
    }
}

/* ---------------- ids and signatures ---------------- */

function uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function order_number(): string
{
    return 'RK' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 8));
}

function now_iso(): string
{
    return gmdate('c');
}

/* Signs a download link. The signature covers the order, the file and
   the expiry, so none of the three can be edited in the URL. */
function sign_download(string $orderId, string $fileId, int $expires): string
{
    return hash_hmac('sha256', $orderId . '|' . $fileId . '|' . $expires, cfg('app_secret'));
}

function download_url(string $orderId, string $fileId): string
{
    $expires = time() + (int) cfg('download_ttl');
    $query = http_build_query([
        'order'   => $orderId,
        'file'    => $fileId,
        'expires' => $expires,
        'sig'     => sign_download($orderId, $fileId, $expires),
    ]);
    return base_url() . '/api/download.php?' . $query;
}

function base_url(): string
{
    $origin = trim((string) cfg('allowed_origin'));
    if ($origin !== '' && str_starts_with($origin, 'http')) {
        return rtrim($origin, '/');
    }

    // Misconfigured origin: build from the request so links still work.
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return ($https ? 'https://' : 'http://') . $host;
}

/* ---------------- order helpers ---------------- */

/* The products an order entitles the buyer to, bundles expanded. */
function entitled_product_ids(string $orderId): array
{
    $pdo = db();

    $stmt = $pdo->prepare('SELECT product_id FROM order_items WHERE order_id = ?');
    $stmt->execute([$orderId]);
    $productIds = array_column($stmt->fetchAll(), 'product_id');
    if (!$productIds) {
        return [];
    }

    // A bundle entitles the buyer to everything inside it.
    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $pdo->prepare("SELECT product_id FROM bundle_items WHERE bundle_id IN ($in)");
    $stmt->execute($productIds);
    foreach ($stmt->fetchAll() as $row) {
        $productIds[] = $row['product_id'];
    }

    return array_values(array_unique($productIds));
}

/* Is this one file part of that order? Asked by download.php on every
   single download. */
function order_entitles_file(string $orderId, string $fileId): bool
{
    $productIds = entitled_product_ids($orderId);
    if (!$productIds) {
        return false;
    }

    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = db()->prepare(
        "SELECT 1 FROM product_files WHERE id = ? AND product_id IN ($in) LIMIT 1"
    );
    $stmt->execute(array_merge([$fileId], $productIds));
    return (bool) $stmt->fetchColumn();
}

/* Every file an order entitles the buyer to, de-duplicated, as signed
   links. Callers must have already checked the order is paid. */
function files_for_order(string $orderId): array
{
    $pdo = db();
    $productIds = entitled_product_ids($orderId);
    if (!$productIds) {
        return [];
    }

    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT id, display_name, storage_file FROM product_files
         WHERE product_id IN ($in) ORDER BY sort_order, display_name"
    );
    $stmt->execute($productIds);

    $files = [];
    $seen = [];
    foreach ($stmt->fetchAll() as $row) {
        if (isset($seen[$row['storage_file']])) {
            continue;
        }
        $seen[$row['storage_file']] = true;
        $files[] = [
            'name'     => $row['display_name'],
            'filename' => 'RK Aesthetics - ' . $row['display_name'] . '.pdf',
            'url'      => download_url($orderId, $row['id']),
        ];
    }
    return $files;
}

function find_order(string $orderId): ?array
{
    $stmt = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    return $order ?: null;
}

function mark_paid(string $orderId, string $paymentId, string $state = 'COMPLETED'): void
{
    $stmt = db()->prepare(
        "UPDATE orders SET status = 'paid', paid_at = ?, provider_payment_id = ?, provider_state = ?
         WHERE id = ? AND status <> 'paid'"
    );
    $stmt->execute([now_iso(), $paymentId, $state, $orderId]);
}

function mark_failed(string $orderId, string $state): void
{
    $stmt = db()->prepare(
        "UPDATE orders SET status = 'failed', provider_state = ?
         WHERE id = ? AND status <> 'paid'"
    );
    $stmt->execute([$state, $orderId]);
}

/* ---------------- PhonePe ----------------
 * Standard Checkout v2: fetch an OAuth token, ask for a payment page,
 * then confirm by asking PhonePe what happened. The buyer leaves the
 * site for PhonePe and comes back, so nothing the browser reports is
 * ever trusted: the status call is the source of truth.
 *
 * Hosts per PhonePe's integration docs. If they change, this is the
 * only place to edit.
 */
function phonepe_hosts(): array
{
    $sandbox = cfg('phonepe_env') !== 'production';
    return $sandbox
        ? [
            'auth' => 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
            'api'  => 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        ]
        : [
            'auth' => 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
            'api'  => 'https://api.phonepe.com/apis/pg',
        ];
}

function cache_get(string $key): ?string
{
    $stmt = db()->prepare('SELECT value FROM app_cache WHERE cache_key = ? AND expires_at > ?');
    $stmt->execute([$key, time()]);
    $row = $stmt->fetch();
    return $row ? (string) $row['value'] : null;
}

function cache_put(string $key, string $value, int $ttlSeconds): void
{
    $pdo = db();
    $stmt = $pdo->prepare('DELETE FROM app_cache WHERE cache_key = ?');
    $stmt->execute([$key]);
    $stmt = $pdo->prepare('INSERT INTO app_cache (cache_key, value, expires_at) VALUES (?,?,?)');
    $stmt->execute([$key, $value, time() + $ttlSeconds]);
}

/* Access tokens last about an hour, so they are cached rather than
   fetched on every checkout. */
function phonepe_token(): string
{
    $cached = cache_get('phonepe_token');
    if ($cached !== null) {
        return $cached;
    }

    $hosts = phonepe_hosts();
    $body = http_build_query([
        'client_id'      => cfg('phonepe_client_id'),
        'client_version' => (string) cfg('phonepe_client_version'),
        'client_secret'  => cfg('phonepe_client_secret'),
        'grant_type'     => 'client_credentials',
    ]);

    [$status, $response, $error] = http_post(
        $hosts['auth'],
        $body,
        ['Content-Type: application/x-www-form-urlencoded']
    );

    if ($status < 200 || $status >= 300) {
        fail('Could not reach PhonePe', 502, 'token http ' . $status . ': ' . ($error ?: $response));
    }

    $data = json_decode((string) $response, true);
    $token = $data['access_token'] ?? null;
    if (!$token) {
        fail('Could not reach PhonePe', 502, 'token reply: ' . $response);
    }

    // expires_at is a unix timestamp; keep a minute of headroom.
    $ttl = isset($data['expires_at'])
        ? max(60, (int) $data['expires_at'] - time() - 60)
        : 3000;
    cache_put('phonepe_token', $token, $ttl);

    return $token;
}

/* One place for every outbound call, so timeouts and error handling
   are the same everywhere. */
function http_post(string $url, string $body, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 25,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, $response, $error];
}

function http_get(string $url, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 25,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, $response, $error];
}

function phonepe_headers(): array
{
    return [
        'Content-Type: application/json',
        'Accept: application/json',
        'Authorization: O-Bearer ' . phonepe_token(),
    ];
}

/* Asks PhonePe what actually happened to an order. Returns the raw
   decoded reply, or null if PhonePe could not be reached. */
function phonepe_order_status(string $merchantOrderId): ?array
{
    $hosts = phonepe_hosts();
    $url = $hosts['api'] . '/checkout/v2/order/' . rawurlencode($merchantOrderId) . '/status?details=false';

    [$status, $response, $error] = http_get($url, phonepe_headers());
    if ($status < 200 || $status >= 300) {
        error_log('[rk-api] status http ' . $status . ': ' . ($error ?: $response));
        return null;
    }

    $data = json_decode((string) $response, true);
    return is_array($data) ? $data : null;
}

/* Applies a PhonePe status to our order. Returns the state we settled
   on: paid, failed or pending. */
function apply_phonepe_state(array $order, array $status): string
{
    $state = strtoupper((string) ($status['state'] ?? ''));

    if ($state === 'COMPLETED') {
        $paymentId = '';
        if (!empty($status['paymentDetails'][0]['transactionId'])) {
            $paymentId = (string) $status['paymentDetails'][0]['transactionId'];
        }
        // What was actually paid must match what we asked for.
        $paid = (int) ($status['amount'] ?? 0);
        if ($paid > 0 && $paid !== (int) $order['total_inr'] * 100) {
            error_log('[rk-api] amount mismatch on order ' . $order['id'] . ': ' . $paid);
            mark_failed($order['id'], 'AMOUNT_MISMATCH');
            return 'failed';
        }
        mark_paid($order['id'], $paymentId, $state);
        return 'paid';
    }

    if ($state === 'FAILED') {
        mark_failed($order['id'], $state);
        return 'failed';
    }

    return 'pending';
}

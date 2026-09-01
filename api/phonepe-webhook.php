<?php
/**
 * phonepe-webhook
 *
 * The backstop. order-status settles most orders when the buyer comes
 * back from PhonePe, but somebody who closes the tab on the payment
 * page never returns. PhonePe tells us server to server instead, and
 * that message cannot be closed or lost.
 *
 * Set this up at: PhonePe Business dashboard → Developer Settings →
 * Webhooks.
 *   URL:      https://yourdomain.com/api/phonepe-webhook.php
 *   Username and password: the same pair as in config.php
 *   Events:   order completed and failed, plus refunds
 *
 * PhonePe authenticates itself with an Authorization header holding
 * SHA256("username:password"), so the credentials never travel.
 */

require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}

$provided = trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
// Some hosts strip the header; this is the usual fallback.
if ($provided === '' && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $provided = trim((string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
}
// Tolerate a scheme prefix if one is ever added.
if (stripos($provided, 'sha256 ') === 0) {
    $provided = substr($provided, 7);
}

$expected = hash('sha256', cfg('phonepe_webhook_username') . ':' . cfg('phonepe_webhook_password'));

if ($provided === '' || !hash_equals($expected, strtolower($provided))) {
    error_log('[rk-api] webhook rejected: bad credentials');
    http_response_code(401);
    echo 'Unauthorized';
    exit;
}

$raw = file_get_contents('php://input');
$event = json_decode((string) $raw, true);
if (!is_array($event)) {
    http_response_code(400);
    exit;
}

try {
    $payload = $event['payload'] ?? [];
    $merchantOrderId = (string) ($payload['merchantOrderId'] ?? '');
    $state = strtoupper((string) ($payload['state'] ?? ''));
    $type = strtolower((string) ($event['event'] ?? ''));

    if ($merchantOrderId === '') {
        error_log('[rk-api] webhook without merchantOrderId: ' . substr($raw, 0, 300));
        echo 'ok';
        exit;
    }

    $order = find_order($merchantOrderId);
    if (!$order) {
        // 200 so PhonePe stops retrying what we can never resolve.
        error_log('[rk-api] webhook: no order ' . $merchantOrderId);
        echo 'ok';
        exit;
    }

    /* ---------- refunds ---------- */
    if (str_contains($type, 'refund')) {
        if ($state === 'COMPLETED' || str_contains($type, 'completed')) {
            $stmt = db()->prepare("UPDATE orders SET status = 'refunded' WHERE id = ?");
            $stmt->execute([$order['id']]);
            error_log('[rk-api] order refunded: ' . $order['id']);
        }
        echo 'ok';
        exit;
    }

    /* ---------- payment ---------- */
    if ($order['status'] === 'paid') {
        // order-status usually got here first. Retries land here too.
        echo 'ok';
        exit;
    }

    // Trust the state in the webhook only far enough to act on it, and
    // confirm against the status API before handing over files.
    $status = phonepe_order_status($merchantOrderId);
    if ($status === null) {
        // Could not confirm: 500 asks PhonePe to try again later.
        http_response_code(500);
        echo 'retry';
        exit;
    }

    $settled = apply_phonepe_state($order, $status);
    error_log('[rk-api] webhook settled ' . $order['id'] . ' as ' . $settled);

    // TODO: when $settled === 'paid', send the delivery email here, so
    // a buyer who closed the tab still receives their links.

    echo 'ok';
} catch (Throwable $e) {
    error_log('[rk-api] webhook failed: ' . $e->getMessage());
    http_response_code(500);
    echo 'error';
}

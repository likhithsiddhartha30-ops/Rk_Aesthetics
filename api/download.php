<?php
/**
 * download
 *
 * Streams one PDF out of the private folder. This is the only route
 * to a file: the folder itself sits outside the web root, so there is
 * no URL that reaches a PDF directly.
 *
 * Three things must hold, and all three are checked:
 *   1. the link's signature is ours and has not been edited
 *   2. the link has not expired
 *   3. the order is paid, and this file belongs to it
 */

require __DIR__ . '/lib.php';

function deny(string $message, int $status = 403): void
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

$orderId = (string) ($_GET['order'] ?? '');
$fileId  = (string) ($_GET['file'] ?? '');
$expires = (int) ($_GET['expires'] ?? 0);
$sig     = (string) ($_GET['sig'] ?? '');

if ($orderId === '' || $fileId === '' || $expires === 0 || $sig === '') {
    deny('This download link is incomplete.', 400);
}

/* 1. our signature, unedited */
if (!hash_equals(sign_download($orderId, $fileId, $expires), $sig)) {
    deny('This download link is not valid.');
}

/* 2. still in date */
if ($expires < time()) {
    deny('This download link has expired. Open your downloads page again for a fresh one.', 410);
}

/* 3. paid, and this file is part of it */
$order = find_order($orderId);
if (!$order || $order['status'] !== 'paid') {
    deny('This order is not ready for download.', 404);
}

if (!order_entitles_file($orderId, $fileId)) {
    deny('That file is not part of this order.', 404);
}

$stmt = db()->prepare('SELECT display_name, storage_file FROM product_files WHERE id = ?');
$stmt->execute([$fileId]);
$row = $stmt->fetch();
if (!$row) {
    deny('That file could not be found.', 404);
}

/* basename() so a stored path can never climb out of the folder. */
$path = rtrim((string) cfg('storage_path'), '/\\') . DIRECTORY_SEPARATOR . basename($row['storage_file']);
if (!is_file($path) || !is_readable($path)) {
    error_log('[rk-api] missing file on disk: ' . $path);
    deny('That file is temporarily unavailable. Please contact support.', 500);
}

/* Log it: a shared order id shows up here first. */
try {
    $stmt = db()->prepare(
        'INSERT INTO download_events (id, order_id, file_id, ip, user_agent, created_at)
         VALUES (?,?,?,?,?,?)'
    );
    $stmt->execute([
        uuid_v4(),
        $orderId,
        $fileId,
        $_SERVER['REMOTE_ADDR'] ?? null,
        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
        now_iso(),
    ]);
} catch (Throwable $e) {
    // Logging must never stop a paying customer downloading.
    error_log('[rk-api] download log failed: ' . $e->getMessage());
}

$filename = 'RK Aesthetics - ' . $row['display_name'] . '.pdf';

while (ob_get_level() > 0) {
    ob_end_clean();
}

header('Content-Type: application/pdf');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . str_replace('"', '', $filename) . '"');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');

readfile($path);

<?php
/**
 * order-files
 *
 * Hands back download links for an order that has actually been paid
 * for. Used when the buyer reloads their downloads page, comes back
 * later, or when the previous links have expired.
 *
 * The order's uuid is the key. It is unguessable, it is only ever
 * shown to the person who paid, and it is worthless until the order
 * is marked paid by verify-payment or the webhook.
 */

require __DIR__ . '/lib.php';

$body = begin_json_request();

$orderId = (string) ($body['order_id'] ?? '');
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $orderId)) {
    fail('That download link is not valid');
}

$order = find_order($orderId);

/* Same answer for "no such order" and "not paid for", so nobody can
   probe which order ids exist. */
if (!$order || $order['status'] !== 'paid') {
    json_out([
        'error'  => 'This order is not ready yet',
        'detail' => 'If you have just paid, give it a few seconds and try again. Payments occasionally take a minute to confirm.',
    ], 404);
}

$stmt = db()->prepare('SELECT product_name, unit_price_inr FROM order_items WHERE order_id = ?');
$stmt->execute([$orderId]);

json_out([
    'order_id'     => $orderId,
    'order_number' => $order['order_number'],
    'paid_at'      => $order['paid_at'],
    'total_inr'    => (int) $order['total_inr'],
    'items'        => $stmt->fetchAll(),
    'files'        => files_for_order($orderId),
]);

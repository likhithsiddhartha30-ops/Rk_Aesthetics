<?php
/**
 * order-status
 *
 * The only route to a download link. Called by the downloads page
 * when the buyer comes back from PhonePe, on a later visit, and again
 * whenever the previous links have expired.
 *
 * If the order is not marked paid yet, this asks PhonePe directly
 * rather than believing anything the browser says. The webhook does
 * the same job for buyers who never come back to the site; whichever
 * arrives first settles the order, and the other becomes a no-op.
 *
 * The order's uuid is the key: unguessable, only ever shown to the
 * person who paid, and worthless until the order is actually paid.
 */

require __DIR__ . '/lib.php';

$body = begin_json_request();

$orderId = (string) ($body['order_id'] ?? '');
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $orderId)) {
    fail('That download link is not valid');
}

$order = find_order($orderId);
if (!$order) {
    // Same answer as an unpaid order, so nobody can probe which ids exist.
    json_out([
        'error'  => 'This order is not ready yet',
        'detail' => 'If you have just paid, give it a few seconds and try again.',
        'status' => 'unknown',
    ], 404);
}

/* Not settled yet: ask PhonePe what happened. */
if ($order['status'] === 'created') {
    $status = phonepe_order_status($orderId);

    if ($status === null) {
        json_out([
            'error'  => 'We could not reach PhonePe just now',
            'detail' => 'Your payment is safe. Wait a few seconds and try again.',
            'status' => 'pending',
        ], 503);
    }

    $settled = apply_phonepe_state($order, $status);
    $order = find_order($orderId) ?? $order;

    if ($settled === 'pending') {
        json_out([
            'error'  => 'Your payment is still being confirmed',
            'detail' => 'PhonePe has not finished confirming this payment. It usually takes a few seconds.',
            'status' => 'pending',
        ], 202);
    }

    if ($settled === 'failed') {
        json_out([
            'error'  => 'That payment did not go through',
            'detail' => 'Nothing has been charged for this order. You can try again from your cart.',
            'status' => 'failed',
        ], 402);
    }
}

if ($order['status'] === 'refunded') {
    json_out([
        'error'  => 'This order was refunded',
        'detail' => 'The download links for a refunded order are switched off. Contact support if this looks wrong.',
        'status' => 'refunded',
    ], 410);
}

if ($order['status'] !== 'paid') {
    json_out([
        'error'  => 'This order is not ready yet',
        'detail' => 'If you have just paid, give it a few seconds and try again.',
        'status' => $order['status'],
    ], 404);
}

$stmt = db()->prepare('SELECT product_name, unit_price_inr FROM order_items WHERE order_id = ?');
$stmt->execute([$orderId]);

json_out([
    'status'       => 'paid',
    'order_id'     => $orderId,
    'order_number' => $order['order_number'],
    'paid_at'      => $order['paid_at'],
    'total_inr'    => (int) $order['total_inr'],
    'items'        => $stmt->fetchAll(),
    'files'        => files_for_order($orderId),
]);

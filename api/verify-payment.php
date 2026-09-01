<?php
/**
 * verify-payment
 *
 * Called the instant Razorpay's checkout succeeds in the browser.
 * Checks the signature Razorpay handed the browser, marks the order
 * paid, and returns the download links.
 *
 * The webhook is still the backstop for anyone who closes the tab
 * before this runs. Both paths are safe to run twice.
 */

require __DIR__ . '/lib.php';

$body = begin_json_request();

$orderId     = (string) ($body['order_id'] ?? '');
$rzpOrderId  = (string) ($body['razorpay_order_id'] ?? '');
$paymentId   = (string) ($body['razorpay_payment_id'] ?? '');
$signature   = (string) ($body['razorpay_signature'] ?? '');

if ($orderId === '' || $rzpOrderId === '' || $paymentId === '' || $signature === '') {
    fail('Missing payment details');
}

/* Razorpay signs "<razorpay_order_id>|<razorpay_payment_id>" with the
   key secret. hash_equals compares in constant time, so the response
   time never leaks how much of a forged signature was right. */
$expected = hash_hmac('sha256', $rzpOrderId . '|' . $paymentId, cfg('razorpay_key_secret'));
if (!hash_equals($expected, $signature)) {
    fail('Payment could not be verified', 400, 'bad signature for payment ' . $paymentId);
}

$order = find_order($orderId);
if (!$order) {
    fail('Order not found', 404);
}

/* A valid signature is not enough: it must belong to THIS order. */
if (!hash_equals((string) $order['razorpay_order_id'], $rzpOrderId)) {
    fail('Payment could not be verified', 400, 'signature/order mismatch on ' . $orderId);
}

if ($order['status'] !== 'paid') {
    mark_paid($orderId, $paymentId);
}

json_out([
    'order_id'     => $orderId,
    'order_number' => $order['order_number'],
    'status'       => 'paid',
    'files'        => files_for_order($orderId),
]);

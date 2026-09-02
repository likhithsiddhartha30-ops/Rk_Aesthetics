<?php
/**
 * razorpay-webhook
 *
 * The backstop. verify-payment marks most orders paid the moment the
 * browser gets its callback, but a buyer who closes the tab mid-
 * payment never runs it. Razorpay tells us server to server instead,
 * and that message cannot be closed, lost or forged.
 *
 * Set this up at: Razorpay Dashboard → Settings → Webhooks
 *   URL:    https://yourdomain.com/api/razorpay-webhook.php
 *   Events: payment.captured, refund.processed
 *   Secret: the same value as razorpay_webhook_secret in config.php
 */

require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}

/* The signature covers the RAW body, so read it before decoding. */
$raw = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $raw, cfg('razorpay_webhook_secret'));

if ($signature === '' || !hash_equals($expected, $signature)) {
    error_log('[rk-api] webhook rejected: bad signature');
    http_response_code(401);
    echo 'Invalid signature';
    exit;
}

$event = json_decode($raw, true);
if (!is_array($event)) {
    http_response_code(400);
    exit;
}

try {
    $pdo = db();

    /* ---------- payment succeeded ---------- */
    if (($event['event'] ?? '') === 'payment.captured') {
        $payment = $event['payload']['payment']['entity'] ?? [];
        $rzpOrderId = (string) ($payment['order_id'] ?? '');

        $stmt = $pdo->prepare('SELECT * FROM orders WHERE razorpay_order_id = ?');
        $stmt->execute([$rzpOrderId]);
        $order = $stmt->fetch();

        if (!$order) {
            // 200 so Razorpay stops retrying what we can never resolve.
            error_log('[rk-api] webhook: no order for ' . $rzpOrderId);
            echo 'ok';
            exit;
        }

        // verify-payment usually got here first. Retries land here too.
        if ($order['status'] === 'paid') {
            echo 'ok';
            exit;
        }

        // What was actually paid must match what we asked for.
        if ((int) ($payment['amount'] ?? 0) !== (int) $order['total_inr'] * 100) {
            error_log('[rk-api] webhook: amount mismatch on order ' . $order['id']);
            $stmt = $pdo->prepare("UPDATE orders SET status = 'failed' WHERE id = ?");
            $stmt->execute([$order['id']]);
            echo 'ok';
            exit;
        }

        mark_paid($order['id'], (string) ($payment['id'] ?? ''));
        error_log('[rk-api] order marked paid by webhook: ' . $order['id']);

        // TODO: send the delivery email here, so a buyer who closed
        // the tab still receives their links.
    }

    /* ---------- refunded ---------- */
    if (($event['event'] ?? '') === 'refund.processed') {
        $refund = $event['payload']['refund']['entity'] ?? [];
        $paymentId = (string) ($refund['payment_id'] ?? '');

        // A refunded order stops yielding download links.
        $stmt = $pdo->prepare("UPDATE orders SET status = 'refunded' WHERE razorpay_payment_id = ?");
        $stmt->execute([$paymentId]);
        error_log('[rk-api] order refunded for payment ' . $paymentId);
    }

    echo 'ok';
} catch (Throwable $e) {
    // 500 tells Razorpay to retry, which is right for a transient fault.
    error_log('[rk-api] webhook failed: ' . $e->getMessage());
    http_response_code(500);
    echo 'error';
}

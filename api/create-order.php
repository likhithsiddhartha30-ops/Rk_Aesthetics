<?php
/**
 * create-order
 *
 * Called when the buyer submits the checkout form. Prices the cart
 * from the database, asks Razorpay for an order, and records ours as
 * unpaid.
 *
 * The browser sends product ids and contact details. It does NOT send
 * prices: a client that can name its own price is a client that pays
 * one rupee.
 */

require __DIR__ . '/lib.php';

$body = begin_json_request();

/* ---- what are they buying ---- */
$ids = array_values(array_unique(array_filter(
    (array) ($body['product_ids'] ?? []),
    fn ($id) => is_string($id) && $id !== ''
)));
if (!$ids) {
    fail('Your cart is empty');
}

$name  = trim((string) ($body['full_name'] ?? ''));
$email = trim((string) ($body['email'] ?? ''));
if (mb_strlen($name) < 2) {
    fail('Please enter your name');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('Please enter a valid email address');
}

$pdo = db();

$in = implode(',', array_fill(0, count($ids), '?'));
$stmt = $pdo->prepare("SELECT id, name, price_inr FROM products WHERE id IN ($in) AND is_active = 1");
$stmt->execute($ids);
$products = $stmt->fetchAll();

if (count($products) !== count($ids)) {
    fail('One of those products is unavailable');
}

$totalInr = 0;
foreach ($products as $p) {
    $totalInr += (int) $p['price_inr'];
}
$amountPaise = $totalInr * 100;
if ($amountPaise < 100) {
    fail('Order total is too small');
}

/* ---- record our order first, so a Razorpay order always has a home ---- */
$orderId = uuid_v4();
$orderNumber = order_number();

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO orders
            (id, order_number, email, full_name, phone, city, state, gstin, notes,
             status, subtotal_inr, total_inr, currency, created_at)
         VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?)'
    );
    $stmt->execute([
        $orderId,
        $orderNumber,
        $email,
        $name,
        preg_replace('/[\s-]/', '', (string) ($body['phone'] ?? '')) ?: null,
        trim((string) ($body['city'] ?? '')) ?: null,
        trim((string) ($body['state'] ?? '')) ?: null,
        strtoupper(trim((string) ($body['gstin'] ?? ''))) ?: null,
        trim((string) ($body['notes'] ?? '')) ?: null,
        'created',
        $totalInr,
        $totalInr,
        'INR',
        now_iso(),
    ]);

    $stmt = $pdo->prepare(
        'INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_inr)
         VALUES (?,?,?,?,?)'
    );
    foreach ($products as $p) {
        // Name and price are copied in: changing your prices later
        // must not rewrite what somebody paid today.
        $stmt->execute([uuid_v4(), $orderId, $p['id'], $p['name'], (int) $p['price_inr']]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail('Could not start the payment', 500, 'insert order: ' . $e->getMessage());
}

/* ---- ask Razorpay for an order ---- */
$payload = json_encode([
    'amount'   => $amountPaise,
    'currency' => 'INR',
    'receipt'  => $orderNumber,
    'notes'    => ['order_id' => $orderId, 'email' => $email],
]);

$ch = curl_init('https://api.razorpay.com/v1/orders');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_USERPWD        => cfg('razorpay_key_id') . ':' . cfg('razorpay_key_secret'),
    CURLOPT_TIMEOUT        => 20,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode < 200 || $httpCode >= 300) {
    $stmt = $pdo->prepare("UPDATE orders SET status = 'failed' WHERE id = ?");
    $stmt->execute([$orderId]);
    fail('Could not start the payment', 502, 'razorpay: ' . ($curlError ?: $response));
}

$rzp = json_decode($response, true);
if (!isset($rzp['id'])) {
    fail('Could not start the payment', 502, 'razorpay reply: ' . $response);
}

$stmt = $pdo->prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?');
$stmt->execute([$rzp['id'], $orderId]);

/* key_id is publishable: it is meant to reach the browser. */
json_out([
    'order_id'          => $orderId,
    'order_number'      => $orderNumber,
    'razorpay_order_id' => $rzp['id'],
    'amount'            => $amountPaise,
    'currency'          => 'INR',
    'razorpay_key_id'   => cfg('razorpay_key_id'),
    'prefill'           => [
        'name'    => $name,
        'email'   => $email,
        'contact' => (string) ($body['phone'] ?? ''),
    ],
]);

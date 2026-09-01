<?php
/**
 * create-order
 *
 * Called when the buyer submits the checkout form. Prices the cart
 * from the database, records the order unpaid, and asks PhonePe for a
 * payment page to send them to.
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
$phone = preg_replace('/[^0-9]/', '', (string) ($body['phone'] ?? ''));

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

/* ---- record our order first, so a PhonePe order always has a home ---- */
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
        $phone ?: null,
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

/* ---- ask PhonePe for a payment page ----
 * Our own order id is the merchantOrderId, so the status call and the
 * webhook both point straight back at this row.
 */
$hosts = phonepe_hosts();
$redirectUrl = base_url() . '/downloads.html?order=' . rawurlencode($orderId);

$payload = json_encode([
    'merchantOrderId' => $orderId,
    'amount'          => $amountPaise,
    'expireAfter'     => 1200, // 20 minutes to pay
    'metaInfo'        => [
        'udf1' => $orderNumber,
        'udf2' => $email,
    ],
    'paymentFlow' => [
        'type'         => 'PG_CHECKOUT',
        'message'      => cfg('brand_name') . ' order ' . $orderNumber,
        'merchantUrls' => ['redirectUrl' => $redirectUrl],
    ],
]);

[$status, $response, $error] = http_post(
    $hosts['api'] . '/checkout/v2/pay',
    $payload,
    phonepe_headers()
);

if ($status < 200 || $status >= 300) {
    mark_failed($orderId, 'PAY_INIT_FAILED');
    fail('Could not start the payment', 502, 'pay http ' . $status . ': ' . ($error ?: $response));
}

$data = json_decode((string) $response, true);
$redirect = $data['redirectUrl'] ?? null;
if (!$redirect) {
    mark_failed($orderId, 'PAY_INIT_FAILED');
    fail('Could not start the payment', 502, 'pay reply: ' . $response);
}

if (!empty($data['orderId'])) {
    $stmt = $pdo->prepare('UPDATE orders SET provider_order_id = ?, provider_state = ? WHERE id = ?');
    $stmt->execute([(string) $data['orderId'], (string) ($data['state'] ?? 'PENDING'), $orderId]);
}

json_out([
    'order_id'     => $orderId,
    'order_number' => $orderNumber,
    'amount'       => $amountPaise,
    'currency'     => 'INR',
    // The browser sends the buyer here. PhonePe returns them to
    // redirectUrl when they are done, paid or not.
    'redirect_url' => $redirect,
]);

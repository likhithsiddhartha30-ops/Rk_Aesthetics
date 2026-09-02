<?php
/**
 * my-orders
 *
 * Every paid order belonging to whoever is signed in, with fresh
 * download links for each.
 *
 * This is the difference between "the files this browser remembers"
 * and "the files you bought". order-files.php answers for one order
 * to whoever holds its id; this answers for a person, so it needs
 * proof of who they are and takes no identity from the request body.
 *
 * Orders are matched on the email the buyer checked out with. Anyone
 * who can read that inbox could already have asked us for their files
 * by hand, so this grants nothing new — it just stops the asking.
 */

require __DIR__ . '/lib.php';
require __DIR__ . '/magic.php';

begin_json_request();

$email = magic_email_from_request();

/* Emails are compared case-insensitively: people capitalise their own
   address differently from one form to the next, and an order they
   cannot see is worse than a duplicate row. */
$stmt = db()->prepare(
    'SELECT id, order_number, paid_at, total_inr
       FROM orders
      WHERE LOWER(email) = LOWER(?) AND status = ?
      ORDER BY paid_at DESC
      LIMIT 50'
);
$stmt->execute([$email, 'paid']);
$rows = $stmt->fetchAll();

$items = db()->prepare('SELECT product_name, unit_price_inr FROM order_items WHERE order_id = ?');

$orders = [];
foreach ($rows as $row) {
    $items->execute([$row['id']]);

    $orders[] = [
        'order_id'     => $row['id'],
        'order_number' => $row['order_number'],
        'paid_at'      => $row['paid_at'],
        'total_inr'    => (int) $row['total_inr'],
        'items'        => $items->fetchAll(),
        'files'        => files_for_order($row['id']),
    ];
}

/* An empty list is a normal answer, not an error: somebody may sign
   in with an address they have never bought with, or with a second
   address they meant to use. */
json_out([
    'email'  => $email,
    'orders' => $orders,
]);

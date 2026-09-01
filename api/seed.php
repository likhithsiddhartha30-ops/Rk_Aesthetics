<?php
/**
 * seed
 *
 * Creates the tables and loads the catalogue. Run it once after
 * uploading, and again whenever prices change.
 *
 * From the command line (best):    php seed.php
 * From a browser:                  https://yourdomain.com/api/seed.php?key=YOUR_APP_SECRET
 *
 * It is safe to run repeatedly: products are updated in place and
 * orders are never touched.
 *
 * DELETE THIS FILE once the shop is live, or leave it — it refuses to
 * run over the web without the app secret.
 */

require __DIR__ . '/lib.php';

$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    $key = (string) ($_GET['key'] ?? '');
    if (!hash_equals((string) cfg('app_secret'), $key)) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
}

/* Nine systems at 399, the bundle at 3000. Keep in step with
   js/products.js — this is the copy that decides what people pay. */
$products = [
    ['executive-body-system',       'The Executive Body System',      'bundle',    3000, 3591, 1, 0],
    ['corporate-diet-plan',         'The Corporate Diet Plan',        'nutrition',  399, null, 0, 1],
    ['corporate-workout-plan',      'The Corporate Workout Plan',     'training',   399, null, 0, 2],
    ['fixing-your-sleep-schedule',  'Fixing Your Sleep Schedule',     'recovery',   399, null, 0, 3],
    ['cortisol-reset',              'The Cortisol Reset',             'recovery',   399, null, 0, 4],
    ['office-lunch-guide',          'The Office Lunch Guide',         'nutrition',  399, null, 0, 5],
    ['business-travel-nutrition',   'Business Travel Nutrition Plan', 'nutrition',  399, null, 0, 6],
    ['weekend-eating-control',      'Weekend Eating Control Plan',    'nutrition',  399, null, 0, 7],
    ['desk-job-mobility',           'The Desk-Job Mobility Plan',     'recovery',   399, null, 0, 8],
    ['three-day-executive-workout', 'The 3-Day Executive Workout',    'training',   399, null, 0, 9],
];

/* product id => [display name, file in the private folder] */
$files = [
    'corporate-diet-plan'         => ['The Corporate Diet Plan',       '01-the-corporate-diet-plan.pdf'],
    'corporate-workout-plan'      => ['The Corporate Workout Plan',    '02-the-corporate-workout-plan.pdf'],
    'fixing-your-sleep-schedule'  => ['Fixing Your Sleep Schedule',    '03-fixing-your-sleep-schedule.pdf'],
    'cortisol-reset'              => ['The Cortisol Reset',            '04-the-cortisol-reset.pdf'],
    'office-lunch-guide'          => ['The Office Lunch Guide',        '05-the-office-lunch-guide.pdf'],
    'business-travel-nutrition'   => ['Business Travel Nutrition Plan','06-business-travel-nutrition-plan.pdf'],
    'weekend-eating-control'      => ['Weekend Eating Control Plan',   '07-weekend-eating-control-plan.pdf'],
    'desk-job-mobility'           => ['The Desk-Job Mobility Plan',    '08-the-desk-job-mobility-plan.pdf'],
    'three-day-executive-workout' => ['The 3-Day Executive Workout',   '09-the-3-day-executive-workout.pdf'],
    // The catalogue PDF ships with the bundle.
    'executive-body-system'       => ['Product Catalogue and Pricing', '00-product-catalog-and-pricing.pdf'],
];

$pdo = db();
$out = [];

foreach ($products as [$id, $name, $category, $price, $oldPrice, $isBundle, $sort]) {
    $stmt = $pdo->prepare('SELECT id FROM products WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->fetch()) {
        $stmt = $pdo->prepare(
            'UPDATE products SET name = ?, category = ?, price_inr = ?, old_price_inr = ?,
             is_bundle = ?, is_active = 1, sort_order = ? WHERE id = ?'
        );
        $stmt->execute([$name, $category, $price, $oldPrice, $isBundle, $sort, $id]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO products (id, name, category, price_inr, old_price_inr, is_bundle, is_active, sort_order)
             VALUES (?,?,?,?,?,?,1,?)'
        );
        $stmt->execute([$id, $name, $category, $price, $oldPrice, $isBundle, $sort]);
    }
}
$out[] = count($products) . ' products';

/* The bundle contains all nine singles. */
$pdo->exec('DELETE FROM bundle_items');
$stmt = $pdo->prepare('INSERT INTO bundle_items (bundle_id, product_id) VALUES (?,?)');
foreach ($products as [$id, , , , , $isBundle]) {
    if (!$isBundle) {
        $stmt->execute(['executive-body-system', $id]);
    }
}
$out[] = '9 bundle contents';

/* Files, keyed by storage name so re-running does not duplicate. */
$missing = [];
foreach ($files as $productId => [$displayName, $storageFile]) {
    $stmt = $pdo->prepare('SELECT id FROM product_files WHERE storage_file = ?');
    $stmt->execute([$storageFile]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare('UPDATE product_files SET product_id = ?, display_name = ? WHERE id = ?');
        $stmt->execute([$productId, $displayName, $existing['id']]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO product_files (id, product_id, display_name, storage_file, sort_order)
             VALUES (?,?,?,?,0)'
        );
        $stmt->execute([uuid_v4(), $productId, $displayName, $storageFile]);
    }

    $path = rtrim((string) cfg('storage_path'), '/\\') . DIRECTORY_SEPARATOR . $storageFile;
    if (!is_file($path)) {
        $missing[] = $storageFile;
    }
}
$out[] = count($files) . ' files registered';

echo "Seeded: " . implode(', ', $out) . "\n";

if ($missing) {
    echo "\nWARNING: these files are registered but are not in " . cfg('storage_path') . ":\n";
    foreach ($missing as $m) {
        echo "  - $m\n";
    }
    echo "Buyers of those products will not be able to download until you upload them.\n";
} else {
    echo "All PDFs found in " . cfg('storage_path') . "\n";
}

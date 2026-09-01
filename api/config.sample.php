<?php
/**
 * RK AESTHETICS — API configuration
 *
 * THIS FILE HOLDS SECRETS. It is excluded from git on purpose. Copy
 * config.sample.php to config.php on the server and fill it in there;
 * never commit the filled-in version.
 *
 * Nothing here is ever sent to the browser: every value is used
 * server-side only.
 */

if (!defined('RK_APP')) {
    // Someone requested this file directly. Say nothing useful.
    http_response_code(404);
    exit;
}

return [
    /* ---------------- Razorpay ---------------- */
    // Dashboard → Account & Settings → API Keys.
    // Start with test keys (rzp_test_...) and switch to live later.
    'razorpay_key_id'     => 'rzp_test_xxxxxxxxxxxxx',
    'razorpay_key_secret' => 'xxxxxxxxxxxxxxxxxxxxxxxx',

    // Dashboard → Settings → Webhooks. Any long random string, as
    // long as it matches what you type into Razorpay.
    'razorpay_webhook_secret' => 'change-me-to-something-long-and-random',

    /* ---------------- This app ---------------- */
    // Used to sign download links. Any long random string; changing
    // it invalidates every link already issued.
    'app_secret' => 'change-me-too-something-else-long-and-random',

    // Where the PDFs live. KEEP THIS OUTSIDE THE WEB ROOT, so nobody
    // can request a file directly. On cPanel that usually means
    // something like /home/youruser/rk-products
    'storage_path' => __DIR__ . '/../../rk-private/products',

    // How long a download link stays valid.
    'download_ttl' => 900, // 15 minutes

    /* ---------------- Database ----------------
     * SQLite needs no setup and is plenty for this: one file, and the
     * whole shop fits in it. Keep the file outside the web root too.
     *
     * For MySQL instead, use:
     *   'dsn'  => 'mysql:host=localhost;dbname=yourdb;charset=utf8mb4',
     *   'user' => 'dbuser',
     *   'pass' => 'dbpass',
     */
    'dsn'  => 'sqlite:' . __DIR__ . '/../../rk-private/shop.sqlite',
    'user' => null,
    'pass' => null,

    /* ---------------- Site ---------------- */
    // The exact origin the shop is served from. Browsers block the
    // API calls if this does not match.
    'allowed_origin' => 'https://rkaesthetics.com',

    // Shown on the Razorpay payment window.
    'brand_name' => 'RK Aesthetics',

    // Set true while testing to see real error messages in responses.
    // Leave false in production: errors go to the log instead.
    'debug' => false,
];

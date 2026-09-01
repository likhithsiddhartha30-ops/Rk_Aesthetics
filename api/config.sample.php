<?php
/**
 * RK AESTHETICS — API configuration
 *
 * THIS FILE HOLDS SECRETS. Copy it to config.php on the server and
 * fill that in; config.php is excluded from git on purpose. Never
 * commit the filled-in version.
 *
 * Nothing here is ever sent to the browser.
 */

if (!defined('RK_APP')) {
    // Someone requested this file directly. Say nothing useful.
    http_response_code(404);
    exit;
}

return [
    /* ---------------- PhonePe ----------------
     * From the PhonePe Business dashboard, under Developer Settings.
     *
     * These are Standard Checkout v2 credentials. If PhonePe gave you
     * a merchantId + saltKey + saltIndex instead, that is the older
     * PG API and this code will not match it — say so and the calls
     * in lib.php need swapping for the /pg/v1/pay + X-VERIFY style.
     */
    'phonepe_client_id'      => 'YOUR_CLIENT_ID',
    'phonepe_client_secret'  => 'YOUR_CLIENT_SECRET',
    'phonepe_client_version' => '1',

    // 'sandbox' while testing, 'production' when you go live.
    'phonepe_env' => 'sandbox',

    /* Webhook credentials. You choose these yourself in the PhonePe
       dashboard when adding the webhook, and repeat them here. */
    'phonepe_webhook_username' => 'change-me',
    'phonepe_webhook_password' => 'change-me-to-something-long',

    /* ---------------- This app ---------------- */
    // Signs download links. Any long random string; changing it
    // invalidates every link already issued.
    'app_secret' => 'change-me-to-something-long-and-random',

    // Where the PDFs live. KEEP THIS OUTSIDE THE WEB ROOT, so nobody
    // can request a file directly. On cPanel that usually means
    // something like /home/youruser/rk-private/products
    'storage_path' => __DIR__ . '/../../rk-private/products',

    // How long a download link stays valid.
    'download_ttl' => 900, // 15 minutes

    /* ---------------- Database ----------------
     * SQLite needs no setup and is plenty for this. Keep the file
     * outside the web root too.
     *
     * For MySQL instead:
     *   'dsn'  => 'mysql:host=localhost;dbname=yourdb;charset=utf8mb4',
     *   'user' => 'dbuser',
     *   'pass' => 'dbpass',
     */
    'dsn'  => 'sqlite:' . __DIR__ . '/../../rk-private/shop.sqlite',
    'user' => null,
    'pass' => null,

    /* ---------------- Site ---------------- */
    // The exact origin the shop is served from. Used for CORS and to
    // build the URL PhonePe sends the buyer back to.
    'allowed_origin' => 'https://rkaesthetics.com',

    'brand_name' => 'RK Aesthetics',

    // true while testing: real error messages come back in responses.
    // Leave false in production; errors go to the log instead.
    'debug' => false,
];

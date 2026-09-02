<?php
/**
 * Magic (magic.link) — turning a login into an email we can trust.
 *
 * The browser signs the buyer in, Magic emails them the link, and the
 * browser ends up holding a DID token. That token is the only thing
 * that reaches us, and on its own it proves nothing: anyone can post
 * a made-up string. So we hand it to Magic's SDK, which checks the
 * signature, and only then ask Magic which email it belongs to.
 *
 * Nothing here trusts an email sent by the browser. The email is
 * always the one Magic reports for the validated token.
 */

if (!defined('RK_APP')) {
    // Someone requested this file directly. Say nothing useful.
    http_response_code(404);
    exit;
}

/* Composer puts the SDK in api/vendor. Some hosts prefer to keep
   vendor above the web root, so look there too before giving up. */
(static function (): void {
    foreach ([__DIR__ . '/vendor/autoload.php', __DIR__ . '/../vendor/autoload.php'] as $autoload) {
        if (is_file($autoload)) {
            require_once $autoload;
            return;
        }
    }
})();

/**
 * The Authorization header, which is more awkward than it should be.
 *
 * Apache hands PHP the header only sometimes: under CGI and FastCGI
 * it is stripped unless .htaccess puts it back, and after an internal
 * redirect it arrives with a REDIRECT_ prefix. Check every spelling
 * before concluding the buyer sent nothing.
 */
function authorization_header(): string
{
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($_SERVER[$key])) {
            return (string) $_SERVER[$key];
        }
    }

    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0 && $value !== '') {
                return (string) $value;
            }
        }
    }

    return '';
}

/**
 * The signed-in buyer's email address, or a 401 that ends the request.
 *
 * Every failure answers the same way. A caller must not be able to
 * tell an expired token from a forged one, or learn which emails have
 * accounts, by reading our error messages.
 */
function magic_email_from_request(): string
{
    $secret = cfg('magic_secret_key');
    if (!$secret || !str_starts_with((string) $secret, 'sk_')) {
        fail('Sign-in is not available', 503, 'magic_secret_key is missing or not a secret key');
    }

    if (!class_exists('\MagicAdmin\Magic')) {
        fail('Sign-in is not available', 503, 'magic-admin-php is not installed: run composer install in api/');
    }

    $header = authorization_header();
    if ($header === '') {
        fail('Please sign in again', 401, 'no Authorization header reached PHP');
    }

    try {
        $magic = new \MagicAdmin\Magic($secret);
        $token = \MagicAdmin\Util\Http::parse_authorization_header_value($header);
        if (!$token) {
            fail('Please sign in again', 401, 'Authorization header was not a Bearer token');
        }

        /* Throws if the token is forged, altered or past its life. */
        $magic->token->validate($token);

        $issuer = $magic->token->get_issuer($token);
        $meta   = $magic->user->get_metadata_by_issuer($issuer);
    } catch (\Throwable $e) {
        fail('Please sign in again', 401, 'magic token rejected: ' . $e->getMessage());
    }

    /* The SDK returns an object, but be forgiving about its shape so a
       future release cannot break sign-in silently. */
    $data  = is_object($meta) && isset($meta->data) ? $meta->data : $meta;
    $email = '';
    if (is_object($data) && isset($data->email)) {
        $email = (string) $data->email;
    } elseif (is_array($data) && isset($data['email'])) {
        $email = (string) $data['email'];
    }

    $email = trim($email);
    if ($email === '') {
        fail('Please sign in again', 401, 'magic returned no email for the issuer');
    }

    return $email;
}

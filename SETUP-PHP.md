# Switching payments on — PhonePe

The whole shop, payment included, runs on ordinary cPanel/Hostinger
style hosting. No Node, no third-party backend.

**What you need:** PHP 8.0 or newer with `curl` and `pdo_sqlite` (or
MySQL), the ability to create a folder outside your web root, and
PhonePe Standard Checkout v2 credentials.

> **Note on credentials.** This code is built for Standard Checkout
> **v2**: `client_id`, `client_secret`, `client_version`. If PhonePe
> gives you `merchantId` + `saltKey` + `saltIndex` instead, that is
> the older PG API with a different signing scheme, and the calls in
> `lib.php` need swapping. Tell me and I'll switch them.

---

## 1. Upload

Put the website files in your web root, keeping `api/` with them:

```
public_html/
├── index.html, shop.html, product.html, …
├── css/  js/  images/  Testimonials/
└── api/          <- the PHP endpoints
```

Then make a **private folder outside the web root** and put the ten
PDFs in it:

```
/home/youruser/rk-private/products/00-product-catalog-and-pricing.pdf
/home/youruser/rk-private/products/01-the-corporate-diet-plan.pdf
...
```

This is the part that makes payment mean anything. Anything inside
`public_html` is downloadable by whoever guesses the name; files
outside it are reachable only through `download.php`, which checks the
order is paid first.

## 2. Configure

Copy the sample and fill it in **on the server**:

```
cd public_html/api
cp config.sample.php config.php
```

| Setting | What to put |
|---|---|
| `phonepe_client_id` / `phonepe_client_secret` | PhonePe Business dashboard → Developer Settings |
| `phonepe_client_version` | Usually `1`, as shown next to your credentials |
| `phonepe_env` | `sandbox` while testing, `production` when live |
| `phonepe_webhook_username` / `phonepe_webhook_password` | You invent these, then repeat them in the dashboard in step 4 |
| `app_secret` | A long random string. It signs download links |
| `storage_path` | Absolute path to your private products folder |
| `dsn` | Leave as SQLite, pointing outside the web root |
| `allowed_origin` | Your site's exact origin, e.g. `https://rkaesthetics.com` |

`allowed_origin` matters more here than it looks: it is also used to
build the URL PhonePe sends the buyer back to. Get it wrong and people
return to the wrong place after paying.

`config.php` is gitignored, so your credentials stay off GitHub.

## 3. Create the tables and load the catalogue

```
php public_html/api/seed.php
```

No SSH? Visit `https://yourdomain.com/api/seed.php?key=YOUR_APP_SECRET`
once — it refuses to run without the secret.

It prints what it loaded and warns about any PDF it expects but cannot
find. Run it again whenever prices change.

## 4. Webhook

PhonePe Business dashboard → Developer Settings → Webhooks.

- URL: `https://yourdomain.com/api/phonepe-webhook.php`
- Username and password: the same pair you put in `config.php`
- Events: order completed and failed, plus refunds

PhonePe sends `SHA256("username:password")` in the `Authorization`
header, which is how the endpoint knows the call is really PhonePe.

This is the backstop for buyers who close the tab on PhonePe's page
and never come back. Without it those orders stay unconfirmed until
somebody opens their downloads link.

## 5. Point the site at the API

In `js/config.js`:

```js
FUNCTIONS_BASE: "/api",
API_SUFFIX: ".php",
```

Upload that one file. Payment is now on.

---

## How a paid order works

1. **create-order.php** — prices the cart from the database, never
   from the browser, records the order unpaid, and asks PhonePe for a
   payment page.
2. **The buyer leaves for PhonePe** and pays there. This site never
   sees a card or UPI PIN.
3. **PhonePe returns them** to `downloads.html?order=<uuid>`.
4. **order-status.php** — asks PhonePe what actually happened, settles
   the order, and returns download links valid for 15 minutes. Nothing
   the browser says on the way back is trusted.
5. **phonepe-webhook.php** — the same job server to server, for anyone
   who never came back. Also handles refunds.
6. **download.php** — streams one PDF, only with a valid unexpired
   signature and only for a paid order.

There is no login. An order is identified by its own uuid, which is
unguessable and worthless until that order is paid.

## Test before going live

With `phonepe_env` set to `sandbox` and your test credentials, buy
something using PhonePe's sandbox instrument. Then check:

- the downloads page ends up showing working PDFs
- your `orders` table has a row with status `paid`
- the webhook shows a `200` in PhonePe's dashboard

To read the SQLite database over SSH:

```
sqlite3 /home/youruser/rk-private/shop.sqlite "select order_number,email,status,provider_state,total_inr from orders order by created_at desc limit 10;"
```

Switch `phonepe_env` to `production` and swap in live credentials only
once all three hold.

## When things go wrong

| Situation | What the buyer sees |
|---|---|
| Abandons PhonePe's page | Comes back to "your payment is still being confirmed", then "that payment did not go through". Cart intact, nothing charged |
| Payment still confirming | The downloads page retries five times, three seconds apart, before offering a Try again button |
| PhonePe unreachable | "We could not reach PhonePe just now. Your payment is safe." with a retry |
| Payment failed | Told plainly, sent back to the cart, nothing charged |
| Refunded later | Links stop working and say the order was refunded |

Errors go to your host's PHP error log, never to buyers. Set
`'debug' => true` in `config.php` while testing to see them in the API
responses instead.

## Still missing

**Delivery email.** Everything works while the buyer stays with the
flow, but nobody gets an email. `phonepe-webhook.php` has a TODO where
that belongs — PHP's `mail()` is unreliable for this, so use an SMTP
service. Until then, a buyer who closes the tab early needs you to
look their order up.

**Invoices.** PhonePe records the payment; the site does not produce a
GST invoice.

**Rate limiting.** `create-order.php` will make a PhonePe order for
anyone who asks. That costs nothing and creates only unpaid rows, but
cap it by IP if it is ever abused.

## Security notes

- `config.php` never leaves the server, and `.htaccess` blocks it from
  being served even if the PHP handler is misconfigured. On nginx:
  `location ~ /api/(config|config\.sample|lib)\.php { deny all; }`
- Prices always come from the database, never the request.
- The order status is taken from PhonePe's own API, not from anything
  the browser reports on its way back.
- The amount PhonePe reports is compared against the order total, so a
  tampered payment cannot settle an order.
- Signatures are compared with `hash_equals`, so response timing
  cannot leak how much of a forgery was correct.
- `download.php` runs `basename()` on stored filenames, so a stored
  path can never climb out of the private folder.
- Delete `seed.php` once the shop is live if you would rather it did
  not exist at all.

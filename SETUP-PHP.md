# Switching payments on (PHP hosting)

This is the PHP route: the whole shop, including payment, runs on
ordinary cPanel/Hostinger-style hosting. Nothing else is needed —
no Supabase, no Node.

There is a Supabase version of the same thing in `supabase/`. Use one
or the other, not both.

**What you need:** PHP 8.0 or newer with `curl` and `pdo_sqlite` (or
MySQL), and the ability to create a folder outside your web root.

---

## 1. Upload

Put the website files in your web root (`public_html`), keeping the
`api/` folder with them:

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

This is the part that makes payment mean anything. Files inside
`public_html` are downloadable by anyone who guesses the name; files
outside it can only be reached through `download.php`, which checks
that the order is paid first.

## 2. Configure

Copy the sample and fill it in **on the server**:

```
cd public_html/api
cp config.sample.php config.php
```

Then edit `config.php`:

| Setting | What to put |
|---|---|
| `razorpay_key_id` / `razorpay_key_secret` | Razorpay → Account & Settings → API Keys. Start with test keys. |
| `razorpay_webhook_secret` | Any long random string. You type the same one into Razorpay in step 4. |
| `app_secret` | Another long random string. It signs download links. |
| `storage_path` | The absolute path to your private products folder |
| `dsn` | Leave as SQLite, pointing somewhere outside the web root |
| `allowed_origin` | Your site's exact origin, e.g. `https://rkaesthetics.com` |

`config.php` is gitignored, so your keys stay off GitHub.

## 3. Create the tables and load the catalogue

Over SSH:

```
php public_html/api/seed.php
```

No SSH? Visit `https://yourdomain.com/api/seed.php?key=YOUR_APP_SECRET`
once — it refuses to run without the secret.

It prints what it loaded, and warns you about any PDF it expects but
cannot find in the private folder. Run it again whenever prices change.

## 4. Razorpay webhook

Razorpay Dashboard → Settings → Webhooks → Add New Webhook.

- URL: `https://yourdomain.com/api/razorpay-webhook.php`
- Active events: `payment.captured`, `refund.processed`
- Secret: the same string you put in `razorpay_webhook_secret`

This is the backstop for buyers who close the tab mid-payment. Without
it, those orders never get marked paid and the buyer cannot download.

## 5. Point the site at the API

In `js/config.js`:

```js
FUNCTIONS_BASE: "/api",
API_SUFFIX: ".php",
```

Upload that one file. Payment is now on.

---


---

## 6. Email sign-in (optional)

Without this, the downloads page shows only what the current browser
remembers: buy on a phone and your laptop knows nothing about it.
Turning it on lets a buyer type their email, click a link, and see
every order they have ever paid for, from any device.

Skip this section entirely if you do not want it. The shop sells and
delivers exactly the same either way, and the sign-in box never
appears until both keys below are filled in.

**Install the SDK.** From the `api` folder on the server:

```
cd public_html/api
composer install --no-dev
```

No composer on your host? Run the same command on your own machine and
upload the `api/vendor` folder it creates. It is ordinary PHP; nothing
in it is built for a particular server.

**Add the keys.** Two of them, from the Magic dashboard, and they go in
different places on purpose:

| Key | Goes in | Who can read it |
|---|---|---|
| `pk_live_...` publishable | `js/config.js` → `MAGIC_PUBLISHABLE_KEY` | everyone, by design |
| `sk_live_...` secret | `api/config.php` → `magic_secret_key` | the server only |

Never put the secret key in `js/config.js`. That file is served to
every visitor.

**What it does not do.** Signing in shows a buyer the orders placed
with that email address. It is not a password, it grants no admin
access, and it cannot reveal anything about anyone else's orders.
Someone who can read that inbox could already have emailed you asking
for their files by hand.

## Test before going live

With **test** keys in `config.php`, buy something using card
`4111 1111 1111 1111`, any future expiry, any CVV. Then check:

- the downloads page hands over working PDFs
- Razorpay Dashboard → Webhooks shows a `200` delivery
- your `orders` table has a row with status `paid`

To read the SQLite database over SSH:

```
sqlite3 /home/youruser/rk-private/shop.sqlite "select order_number,email,status,total_inr from orders order by created_at desc limit 10;"
```

Swap to live keys only once all three hold.

## How a paid order works

1. **create-order.php** — prices the cart from the database, never
   from the browser, and records the order unpaid.
2. **Razorpay's window** collects the money on your own page.
3. **verify-payment.php** — checks the signature Razorpay hands the
   browser, marks the order paid, returns download links valid for
   15 minutes.
4. **razorpay-webhook.php** — the same job server to server, for
   anyone who closed the tab. Also revokes access on a refund.
5. **order-files.php** — re-issues links later, refusing any order
   that is not actually paid.
6. **download.php** — streams one PDF, only with a valid unexpired
   signature and only for a paid order.

There is no login. An order is identified by its own uuid, which is
unguessable and useless until that order is paid.

## When things go wrong

| Situation | What the buyer sees |
|---|---|
| Closes the payment window | "Payment cancelled. Your cart is still here." |
| Card declined | Razorpay's own message; cart untouched |
| Paid, but verification fails | "Your payment went through, but we could not confirm it", with both references and a link to support. The webhook still settles the order, so reloading their downloads link works. |
| Link expired | download.php says so and tells them to reopen their downloads page |

Errors are written to your host's PHP error log, never shown to
buyers. Set `'debug' => true` in `config.php` while testing to see
them in the API responses instead.

## Still missing

**Delivery email.** Everything works while the buyer stays on the
site, but nobody gets an email. `razorpay-webhook.php` has a TODO
where that belongs — PHP's `mail()` is unreliable for this, so use an
SMTP service. Until then, a buyer who closes the tab early needs you
to look their order up.

**Invoices.** Razorpay records the payment; the site does not produce
a GST invoice.

**Rate limiting.** `create-order.php` will make a Razorpay order for
anyone who asks. That costs nothing and creates only unpaid rows, but
if it is ever abused, cap it by IP.

## Security notes

- `config.php` never leaves the server, and `.htaccess` blocks it from
  being served even if something is misconfigured. On nginx, add:
  `location ~ /api/(config|config\.sample|lib)\.php { deny all; }`
- Prices always come from the database.
- Signatures are compared with `hash_equals`, so response timing
  cannot leak how much of a forgery was correct.
- `download.php` uses `basename()` on stored filenames, so a stored
  path can never climb out of the private folder.
- Delete `seed.php` once the shop is live if you would rather it not
  exist at all.

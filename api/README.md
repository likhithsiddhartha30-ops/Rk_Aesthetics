# PHP API

Four endpoints the shop calls, plus the download route and a seeder.

| File | What it does |
|---|---|
| `create-order.php` | Prices the cart from the database, creates a Razorpay order, records ours as unpaid |
| `verify-payment.php` | Checks the signature from Razorpay's checkout, marks the order paid, returns download links |
| `order-files.php` | Re-issues links for an order that is already paid |
| `razorpay-webhook.php` | Server-to-server backstop: marks orders paid, revokes on refund |
| `download.php` | Streams one PDF, only for a paid order and a valid, unexpired signature |
| `seed.php` | Creates the tables and loads the catalogue. Run once, and after price changes |
| `lib.php` | Config, database, signatures. Not an endpoint |
| `config.php` | Your keys. Not in git |

Setup lives in `../SETUP-PHP.md`.

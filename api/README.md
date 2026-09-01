# PHP API — PhonePe

| File | What it does |
|---|---|
| `create-order.php` | Prices the cart from the database, records the order unpaid, asks PhonePe for a payment page |
| `order-status.php` | Asks PhonePe what happened, settles the order, returns download links. The only route to a link |
| `phonepe-webhook.php` | Server-to-server backstop for buyers who never come back, plus refunds |
| `download.php` | Streams one PDF, only for a paid order with a valid unexpired signature |
| `seed.php` | Creates the tables and loads the catalogue. Run once, and after price changes |
| `lib.php` | Config, database, signatures, PhonePe calls. Not an endpoint |
| `config.php` | Your credentials. Not in git |

Setup lives in `../SETUP-PHP.md`.

The buyer leaves the site for PhonePe and comes back, so nothing the
browser reports is trusted: `order-status.php` asks PhonePe directly
before any file is handed over.

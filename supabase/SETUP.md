# Switching payments on

The site works today without any of this: with `CONFIG.FUNCTIONS_BASE`
empty in `js/config.js`, checkout hands the files over for free. Work
through the steps below and the same checkout starts charging instead.

Nothing here puts a secret in the repo. The Razorpay key secret and
the Supabase service role key live only in Supabase.

---

## 1. Database

Supabase dashboard → SQL Editor → paste `supabase/schema.sql` → Run.

It is safe to run more than once. It creates the catalogue, orders,
order items, entitlements and the private `product-files` bucket, and
seeds your ten products at their current prices.

## 2. Upload the PDFs to the private bucket

Storage → `product-files` → upload into a folder called `products`, so
the paths match the seed rows:

```
products/00-product-catalog-and-pricing.pdf
products/01-the-corporate-diet-plan.pdf
...
products/09-the-3-day-executive-workout.pdf
```

The bucket is private and has no user-facing policies: only the Edge
Functions can read it, and only through 15-minute signed links.

## 3. Deploy the functions

```
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy create-order   --no-verify-jwt
supabase functions deploy verify-payment --no-verify-jwt
supabase functions deploy order-files    --no-verify-jwt
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` is correct here: there is no login on the site, so
no request carries a Supabase token. Each function does its own
checking instead — server-side prices, signature verification, and
"is this order actually paid".

No CLI? Supabase dashboard → Edge Functions → Deploy a new function,
and paste each file. The dashboard editor is single-file, so paste the
contents of the matching `_shared/*.ts` above the code that imports it.

## 4. Secrets

```
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxx
supabase secrets set RAZORPAY_KEY_SECRET=xxxxx
supabase secrets set RAZORPAY_WEBHOOK_SECRET=some-long-random-string
supabase secrets set ALLOWED_ORIGIN=https://likhithsiddhartha30-ops.github.io
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected for you.

`ALLOWED_ORIGIN` must match where the site is served from, or browsers
will block the calls. Use your custom domain once you have one.

## 5. Razorpay webhook

Razorpay Dashboard → Settings → Webhooks → Add New Webhook.

- URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
- Active events: `payment.captured`, `refund.processed`
- Secret: the same string you set as `RAZORPAY_WEBHOOK_SECRET`

This is the backstop for buyers who close the tab mid-payment. Without
it, those orders never get marked paid and the buyer cannot download.

## 6. Point the site at it

In `js/config.js`:

```js
FUNCTIONS_BASE: "https://<project-ref>.supabase.co/functions/v1",
```

Commit and push. Payment is now on.

---

## Testing before you go live

Use Razorpay **test mode** keys first. Test card `4111 1111 1111 1111`,
any future expiry, any CVV. Then check in Supabase:

- `orders` has a row with status `paid` and a `razorpay_payment_id`
- the downloads page hands over working links
- Razorpay Dashboard → Webhooks shows a `200` delivery

Swap to live keys only once all three hold.

## What happens when things go wrong

| Situation | What the buyer sees |
|---|---|
| Closes the payment window | "Payment cancelled. Your cart is still here." |
| Card declined | Razorpay's own message; cart untouched |
| Paid, but verify-payment fails | "Your payment went through, but we could not confirm it", with both references and a link to support. The webhook still marks it paid, so a reload of their downloads link works. |
| Comes back days later | The downloads page re-fetches fresh links from `order-files` using the order id kept in their browser |

## Still missing

**Delivery email.** Everything works while the buyer stays on the
site, but nobody gets an email. Add a transactional provider (Resend,
Postmark) and send from `razorpay-webhook` where the TODO sits, so a
buyer who closes the tab still receives their links. Until then, an
order lost mid-flow needs you to look it up in Supabase.

**Invoices.** Razorpay records the payment; the site does not produce a
GST invoice.

---

## IMPORTANT: take the PDFs out of the repo before you charge

The files currently sit at public URLs like
`https://likhithsiddhartha30-ops.github.io/Rk_Aesthetics/Products/01-the-corporate-diet-plan.pdf`
because the free launch needed them there. While that is true, paying
is optional: anyone who guesses a filename gets the product.

Do this in the same change as setting `FUNCTIONS_BASE`, once the files
are uploaded to the private bucket:

```
git rm -r --cached Products
printf '\nProducts/\n' >> .gitignore
git commit -m "Serve the PDFs from private storage only"
git push
```

The local folder stays on your machine; it just stops being published.

Two things to be honest about:

**Git history keeps them.** Removing the folder stops future visitors
finding the files, but anyone who cloned the repo, or who knows how to
read its history, still has them. If that matters, the history has to
be rewritten (`git filter-repo`) and force-pushed, and every existing
clone becomes invalid. Ask before doing that.

**They are already out there.** Anything downloaded during the free
period is gone for good. Price on the assumption that early copies are
in circulation.

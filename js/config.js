/* =========================================================
   RK AESTHETICS — Site configuration

   FILL THIS IN ONCE, when the backend is up.

   FUNCTIONS_BASE is where the API lives.

   PHP hosting, using the api/ folder in this repo (see SETUP-PHP.md):
     FUNCTIONS_BASE: "/api"      <- the API sits on the same domain
     API_SUFFIX:     ".php"

   Supabase Edge Functions instead (see supabase/SETUP.md):
     FUNCTIONS_BASE: "https://YOUR-REF.supabase.co/functions/v1"
     API_SUFFIX:     ""

   Nothing secret belongs in this file. It is served to every visitor.
   The Razorpay key id arrives from the server at checkout time, and
   the key secret never leaves the server.

   Until FUNCTIONS_BASE is filled in, the shop still shows prices and
   still takes people through checkout, but the payment step has
   nowhere to go: it tells them payment opens shortly and hands over
   nothing. Fill this in and the same checkout starts charging.

   ========================================================= */

const CONFIG = {
  /* The site is served from Vercel, which cannot run PHP, so the API
     lives on Hostinger under its own subdomain. Cross-origin is fine:
     allowed_origin in api/config.php names this site, and lib.php
     sends the CORS headers to match. */
  FUNCTIONS_BASE: "https://api.rkaestheticss.com",

  // ".php" for the PHP API in api/, "" for Supabase Edge Functions.
  API_SUFFIX: ".php",

  // Razorpay's checkout script, loaded only on the checkout page.
  RAZORPAY_CHECKOUT_JS: "https://checkout.razorpay.com/v1/checkout.js",

  // Shown on the Razorpay payment window.
  BRAND_NAME: "RK Aesthetics",
  BRAND_COLOR: "#16150f",

  /* Magic (magic.link) powers "sign in with your email" on the
     downloads page, so buyers reach their files from any device.

     This is the PUBLISHABLE key (pk_live_... or pk_test_...), which
     is meant to be public. The secret key belongs in api/config.php.

     Leave this empty and sign-in never appears: the downloads page
     falls back to the orders this browser remembers, exactly as it
     behaved before. Fill in both keys to switch it on.

     Held back deliberately: the server side of sign-in needs the
     Magic PHP SDK, and composer install has not run on the host yet.
     With a key here but no SDK there, buyers would be offered a
     sign-in box that cannot answer. Put the key back the moment
     composer install succeeds — nothing else has to change.

       MAGIC_PUBLISHABLE_KEY: "pk_live_12D441B6D73CF409", */
  MAGIC_PUBLISHABLE_KEY: "",
  MAGIC_SDK_JS: "https://cdn.jsdelivr.net/npm/magic-sdk/dist/magic.js",

  // Where buyers should write when a payment goes wrong.
  SUPPORT_PAGE: "contact.html"
};

/* True once payment is configured. */
function paymentsEnabled() {
  return typeof CONFIG.FUNCTIONS_BASE === "string" && CONFIG.FUNCTIONS_BASE.trim() !== "";
}

function functionUrl(name) {
  return (
    CONFIG.FUNCTIONS_BASE.replace(/\/+$/, "") + "/" + name + (CONFIG.API_SUFFIX || "")
  );
}

/* True once Magic is configured. Sign-in is optional: the shop sells
   and delivers perfectly well without it. */
function accountsEnabled() {
  return (
    paymentsEnabled() &&
    typeof CONFIG.MAGIC_PUBLISHABLE_KEY === "string" &&
    CONFIG.MAGIC_PUBLISHABLE_KEY.trim() !== ""
  );
}

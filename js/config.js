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
  /* Empty on purpose, for now.

     The site is on Vercel, which serves these files beautifully but
     cannot run the PHP in api/ — a POST to a .php file there comes
     back 405, which buyers saw as "Request failed (405)" at the
     moment they tried to pay. Empty is honest instead: checkout says
     payment opens shortly and takes nobody's money.

     Once the api/ folder is running on PHP hosting, set this to that
     origin and payment turns on again:

       FUNCTIONS_BASE: "https://api.rkaestheticss.com",

     Cross-origin is fine: allowed_origin in api/config.php names this
     site, and lib.php sends the CORS headers to match. */
  FUNCTIONS_BASE: "",

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
     behaved before. Fill in both keys to switch it on. */
  MAGIC_PUBLISHABLE_KEY: "pk_live_12D441B6D73CF409",
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

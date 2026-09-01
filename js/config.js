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
  FUNCTIONS_BASE: "",

  // ".php" for the PHP API in api/, "" for Supabase Edge Functions.
  API_SUFFIX: ".php",

  // Razorpay's checkout script, loaded only on the checkout page.
  RAZORPAY_CHECKOUT_JS: "https://checkout.razorpay.com/v1/checkout.js",

  // Shown on the Razorpay payment window.
  BRAND_NAME: "RK Aesthetics",
  BRAND_COLOR: "#16150f",

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

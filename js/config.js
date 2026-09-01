/* =========================================================
   RK AESTHETICS — Site configuration

   FILL THIS IN ONCE, when the backend is up.

   FUNCTIONS_BASE is where the API lives.

   The PHP API in this repo's api/ folder (see SETUP-PHP.md):
     FUNCTIONS_BASE: "/api"      <- the API sits on the same domain
     API_SUFFIX:     ".php"

   API_SUFFIX exists so the same frontend can talk to an API without
   file extensions, if the backend is ever moved somewhere else.

   Nothing secret belongs in this file. It is served to every visitor.
   No payment credentials belong here either: the browser is only
   ever handed a PhonePe URL to go to, and the client secret never
   leaves the server.

   Until FUNCTIONS_BASE is filled in, the shop still shows prices and
   still takes people through checkout, but the payment step has
   nowhere to go: it tells them payment opens shortly and hands over
   nothing. Fill this in and the same checkout starts charging.

   ========================================================= */

const CONFIG = {
  FUNCTIONS_BASE: "",

  // ".php" for the PHP API in api/. "" for an API without extensions.
  API_SUFFIX: ".php",

  // PhonePe hosts its own payment page, so there is no script to load
  // and no branding to pass: that is configured in your PhonePe
  // dashboard instead.
  BRAND_NAME: "RK Aesthetics",

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

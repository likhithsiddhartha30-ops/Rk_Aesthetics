/* =========================================================
   RK AESTHETICS — Site configuration

   FILL THIS IN ONCE, after deploying the Supabase functions.

   FUNCTIONS_BASE is your project's Edge Function URL, which looks
   like:  https://abcdefghijklm.supabase.co/functions/v1
   Find it in Supabase -> Project Settings -> API -> Project URL,
   then add /functions/v1 to the end.

   Nothing secret belongs in this file. It is served to every visitor.
   The Razorpay key id arrives from the server at checkout time, and
   the key secret never leaves Supabase.

   While FUNCTIONS_BASE is empty the site stays in free mode: the
   checkout form hands the files over without asking for payment,
   exactly as it does today. Filling it in switches payment on.

   BEFORE YOU FILL IT IN: the PDFs are still published in this repo,
   at Products/*.pdf, which makes paying optional for anyone who
   guesses a filename. Upload them to the private Supabase bucket and
   remove the public copies in the same change. supabase/SETUP.md has
   the steps.
   ========================================================= */

const CONFIG = {
  FUNCTIONS_BASE: "",

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
  return CONFIG.FUNCTIONS_BASE.replace(/\/+$/, "") + "/" + name;
}

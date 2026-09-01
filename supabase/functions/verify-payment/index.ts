// =============================================================
// verify-payment
//
// Called by the browser the instant Razorpay's checkout succeeds. It
// checks the signature Razorpay handed the browser, marks the order
// paid, and returns the download links — so the buyer gets their
// files immediately rather than waiting on the webhook.
//
// The webhook remains the backstop for anyone who closes the tab
// before this runs. Both paths are idempotent.
//
//   supabase functions deploy verify-payment --no-verify-jwt
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";
import { hmacHex, safeEqual } from "../_shared/crypto.ts";
import { signedFilesForOrder } from "../_shared/files.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing payment details" }, 400);
    }

    // Razorpay signs "<order_id>|<payment_id>" with the key secret.
    const expected = await hmacHex(
      RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );
    if (!safeEqual(razorpay_signature, expected)) {
      console.warn("Rejected payment with bad signature", razorpay_payment_id);
      return json({ error: "Payment could not be verified" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: order, error } = await admin
      .from("orders")
      .select("id, status, total_inr, razorpay_order_id")
      .eq("id", order_id)
      .single();

    if (error || !order) return json({ error: "Order not found" }, 404);

    // The signature must belong to THIS order, not merely be valid.
    if (order.razorpay_order_id !== razorpay_order_id) {
      console.warn("Signature/order mismatch", order_id, razorpay_order_id);
      return json({ error: "Payment could not be verified" }, 400);
    }

    if (order.status !== "paid") {
      const { error: updErr } = await admin
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          razorpay_payment_id
        })
        .eq("id", order.id);
      if (updErr) throw updErr;
    }

    return json({
      order_id: order.id,
      status: "paid",
      files: await signedFilesForOrder(admin, order.id)
    });
  } catch (err) {
    console.error("verify-payment failed:", err);
    return json({ error: "Something went wrong" }, 500);
  }
});

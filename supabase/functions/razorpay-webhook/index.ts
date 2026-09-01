// =============================================================
// razorpay-webhook
//
// The backstop. verify-payment marks most orders paid the moment the
// browser gets its callback, but a buyer who closes the tab mid-
// payment never runs it. Razorpay tells us server-to-server instead,
// and that message cannot be closed, lost or forged.
//
// Deploy WITHOUT JWT verification: Razorpay's servers cannot send a
// Supabase token. The HMAC signature below is the authentication.
//
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Then in Razorpay Dashboard -> Settings -> Webhooks:
//   URL:    https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
//   Events: payment.captured, refund.processed
//   Secret: the same value as RAZORPAY_WEBHOOK_SECRET
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacHex, safeEqual } from "../_shared/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // The signature covers the RAW body — parse only after verifying.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacHex(WEBHOOK_SECRET, raw);

  if (!signature || !safeEqual(signature, expected)) {
    console.warn("Rejected webhook with bad signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const event = JSON.parse(raw);

    /* ---------- payment succeeded ---------- */
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      const { data: order } = await admin
        .from("orders")
        .select("id, status, total_inr")
        .eq("razorpay_order_id", payment.order_id)
        .maybeSingle();

      if (!order) {
        console.error("No order for razorpay id", payment.order_id);
        // 200 so Razorpay stops retrying what we can never resolve.
        return new Response("ok", { status: 200 });
      }

      // verify-payment usually got here first. Retries land here too.
      if (order.status === "paid") return new Response("ok", { status: 200 });

      // What was actually paid must match what we asked for.
      if (payment.amount !== order.total_inr * 100) {
        console.error("Amount mismatch", payment.amount, order.total_inr * 100);
        await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
        return new Response("ok", { status: 200 });
      }

      await admin
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          razorpay_payment_id: payment.id
        })
        .eq("id", order.id);

      console.log("Order marked paid by webhook:", order.id);
      // TODO: send the delivery email here (Resend/Postmark), so the
      // buyer has their links even if they never see the site again.
    }

    /* ---------- refunded ---------- */
    if (event.event === "refund.processed") {
      const refund = event.payload.refund.entity;

      const { data: order } = await admin
        .from("orders")
        .select("id")
        .eq("razorpay_payment_id", refund.payment_id)
        .maybeSingle();

      if (order) {
        // Refunded orders stop yielding download links.
        await admin.from("orders").update({ status: "refunded" }).eq("id", order.id);
        await admin
          .from("entitlements")
          .update({ revoked_at: new Date().toISOString() })
          .eq("order_id", order.id);
        console.log("Order refunded:", order.id);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("webhook failed:", err);
    // 500 tells Razorpay to retry — right for a transient failure.
    return new Response("error", { status: 500 });
  }
});

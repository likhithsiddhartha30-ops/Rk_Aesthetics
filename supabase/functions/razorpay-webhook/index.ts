// =============================================================
// razorpay-webhook
//
// Razorpay calls this when a payment succeeds. THIS is what grants
// the PDFs — never the browser redirect, which can be closed, lost,
// or forged.
//
// Deploy WITHOUT JWT verification: Razorpay's servers cannot send a
// Supabase token. The HMAC signature below is the authentication.
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Then in the Razorpay dashboard → Settings → Webhooks, add:
//   URL:    https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
//   Events: payment.captured, refund.processed
//   Secret: the same value as RAZORPAY_WEBHOOK_SECRET
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

/* Constant-time compare, so the response time never leaks how much of
   a forged signature was correct. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

    // ---------- payment succeeded ----------
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      const { data: order, error } = await admin
        .from("orders")
        .select("id, status, total_inr")
        .eq("razorpay_order_id", payment.order_id)
        .single();

      if (error || !order) {
        console.error("No order for razorpay id", payment.order_id);
        // 200 so Razorpay stops retrying something we can never resolve.
        return new Response("ok", { status: 200 });
      }

      // Already granted? Razorpay retries; do not double-process.
      if (order.status === "paid") return new Response("ok", { status: 200 });

      // The amount actually paid must match what we asked for.
      if (payment.amount !== order.total_inr * 100) {
        console.error("Amount mismatch", payment.amount, order.total_inr * 100);
        await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
        return new Response("ok", { status: 200 });
      }

      await admin
        .from("orders")
        .update({ razorpay_payment_id: payment.id })
        .eq("id", order.id);

      // Marks the order paid and grants every product on it.
      const { error: grantErr } = await admin.rpc("grant_order_entitlements", {
        p_order_id: order.id,
      });
      if (grantErr) throw grantErr;

      console.log("Granted entitlements for order", order.id);
      // TODO: send the delivery email here (Resend/Postmark).
    }

    // ---------- refunded ----------
    if (event.event === "refund.processed") {
      const refund = event.payload.refund.entity;

      const { data: order } = await admin
        .from("orders")
        .select("id, user_id")
        .eq("razorpay_payment_id", refund.payment_id)
        .single();

      if (order?.user_id) {
        await admin.from("orders").update({ status: "refunded" }).eq("id", order.id);
        await admin
          .from("entitlements")
          .update({ revoked_at: new Date().toISOString() })
          .eq("order_id", order.id);
        console.log("Revoked entitlements for refunded order", order.id);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("webhook failed:", err);
    // 500 tells Razorpay to retry — right for a transient failure.
    return new Response("error", { status: 500 });
  }
});

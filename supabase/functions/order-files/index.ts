// =============================================================
// order-files
//
// Hands back the download links for an order that has actually been
// paid for. Used when the buyer reloads their downloads page, comes
// back later, or when the 15-minute signed links have expired.
//
// The order's uuid is the key. It is unguessable, it is only ever
// shown to the person who paid, and it is useless until the order is
// marked paid by verify-payment or the webhook.
//
//   supabase functions deploy order-files --no-verify-jwt
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";
import { signedFilesForOrder } from "../_shared/files.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { order_id } = await req.json();
    if (!order_id || !UUID.test(order_id)) {
      return json({ error: "That download link is not valid" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: order, error } = await admin
      .from("orders")
      .select("id, status, order_number, email, total_inr, paid_at")
      .eq("id", order_id)
      .maybeSingle();

    if (error) throw error;

    // Same answer for "no such order" and "not paid for", so nobody
    // can probe which order ids exist.
    if (!order || order.status !== "paid") {
      return json(
        {
          error: "This order is not ready yet",
          detail:
            "If you have just paid, give it a few seconds and refresh. Payments occasionally take a minute to confirm."
        },
        404
      );
    }

    const { data: items } = await admin
      .from("order_items")
      .select("product_name, unit_price_inr")
      .eq("order_id", order.id);

    return json({
      order_id: order.id,
      order_number: order.order_number,
      paid_at: order.paid_at,
      total_inr: order.total_inr,
      items: items ?? [],
      files: await signedFilesForOrder(admin, order.id)
    });
  } catch (err) {
    console.error("order-files failed:", err);
    return json({ error: "Something went wrong" }, 500);
  }
});

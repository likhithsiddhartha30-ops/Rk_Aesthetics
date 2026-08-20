// =============================================================
// create-order
//
// Called by the checkout page after the buyer fills in their details.
// Prices are read from the database, never from the request body — a
// browser that can name its own price is a browser that pays ₹1.
//
// Deploy WITH JWT verification (the default): only a signed-in user
// may create an order.
//   supabase functions deploy create-order
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, preflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

interface CheckoutBody {
  product_ids: string[];
  full_name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  gstin?: string;
  notes?: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // ---- who is asking? ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not signed in" }, 401);

    // ---- what are they buying? ----
    const body = (await req.json()) as CheckoutBody;
    const ids = [...new Set(body.product_ids ?? [])];   // one copy per product
    if (!ids.length) return json({ error: "Cart is empty" }, 400);
    if (!body.full_name?.trim() || !body.email?.trim()) {
      return json({ error: "Name and email are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, name, price_inr")
      .in("id", ids)
      .eq("is_active", true);

    if (prodErr) throw prodErr;
    if (!products || products.length !== ids.length) {
      return json({ error: "One of those products is unavailable" }, 400);
    }

    // Authoritative total, computed here — not sent by the client.
    const totalInr = products.reduce((sum, p) => sum + p.price_inr, 0);
    const amountPaise = totalInr * 100;

    // ---- ask Razorpay for an order ----
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: { user_id: user.id, email: body.email },
      }),
    });

    if (!rzpRes.ok) {
      console.error("Razorpay order failed:", await rzpRes.text());
      return json({ error: "Could not start payment" }, 502);
    }
    const rzpOrder = await rzpRes.json();

    // ---- record it as unpaid ----
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        email: body.email.trim(),
        full_name: body.full_name.trim(),
        phone: body.phone?.replace(/[\s-]/g, "") || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        gstin: body.gstin?.trim().toUpperCase() || null,
        notes: body.notes?.trim() || null,
        status: "created",
        subtotal_inr: totalInr,
        total_inr: totalInr,
        razorpay_order_id: rzpOrder.id,
      })
      .select("id, order_number")
      .single();

    if (orderErr) throw orderErr;

    const { error: itemsErr } = await admin.from("order_items").insert(
      products.map((p) => ({
        order_id: order.id,
        product_id: p.id,
        product_name: p.name,
        unit_price_inr: p.price_inr,
      })),
    );
    if (itemsErr) throw itemsErr;

    // key_id is publishable — it is meant to reach the browser.
    return json({
      order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
      razorpay_key_id: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("create-order failed:", err);
    return json({ error: "Something went wrong" }, 500);
  }
});

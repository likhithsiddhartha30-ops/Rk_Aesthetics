// =============================================================
// create-order
//
// Called when the buyer submits the checkout form. Creates a Razorpay
// order and records ours as unpaid.
//
// Prices are read from the database, never from the request body: a
// browser that can name its own price is a browser that pays ₹1.
//
// No login required — orders are identified by their own uuid, which
// acts as the buyer's key to the files afterwards.
//
//   supabase functions deploy create-order --no-verify-jwt
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
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
    const body = (await req.json()) as CheckoutBody;

    // One copy of each: these are files, not stock.
    const ids = [...new Set(body.product_ids ?? [])];
    if (!ids.length) return json({ error: "Your cart is empty" }, 400);

    const name = (body.full_name ?? "").trim();
    const email = (body.email ?? "").trim();
    if (name.length < 2) return json({ error: "Please enter your name" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json({ error: "Please enter a valid email address" }, 400);
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

    // The authoritative total, computed here.
    const totalInr = products.reduce((sum, p) => sum + p.price_inr, 0);
    const amountPaise = totalInr * 100;
    if (amountPaise < 100) return json({ error: "Order total is too small" }, 400);

    // ---- our order first, so a Razorpay order always has a home ----
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        email,
        full_name: name,
        phone: body.phone?.replace(/[\s-]/g, "") || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        gstin: body.gstin?.trim().toUpperCase() || null,
        notes: body.notes?.trim() || null,
        status: "created",
        subtotal_inr: totalInr,
        total_inr: totalInr
      })
      .select("id, order_number")
      .single();

    if (orderErr) throw orderErr;

    const { error: itemsErr } = await admin.from("order_items").insert(
      products.map((p) => ({
        order_id: order.id,
        product_id: p.id,
        product_name: p.name,
        unit_price_inr: p.price_inr
      }))
    );
    if (itemsErr) throw itemsErr;

    // ---- ask Razorpay for an order ----
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: order.order_number,
        notes: { order_id: order.id, email }
      })
    });

    if (!rzpRes.ok) {
      const detail = await rzpRes.text();
      console.error("Razorpay order failed:", detail);
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "Could not start the payment" }, 502);
    }

    const rzpOrder = await rzpRes.json();
    await admin
      .from("orders")
      .update({ razorpay_order_id: rzpOrder.id })
      .eq("id", order.id);

    // key_id is publishable; it is meant to reach the browser.
    return json({
      order_id: order.id,
      order_number: order.order_number,
      razorpay_order_id: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
      razorpay_key_id: RAZORPAY_KEY_ID,
      prefill: { name, email, contact: body.phone ?? "" }
    });
  } catch (err) {
    console.error("create-order failed:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

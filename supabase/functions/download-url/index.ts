// =============================================================
// download-url
//
// Turns "I want file X" into a signed URL that works for 5 minutes,
// but only if the buyer actually owns it.
//
// The ownership check is the SELECT itself: the "read files you own"
// RLS policy on product_files means a user client can only see rows
// for products they are entitled to. No row, no download.
//
// Deploy WITH JWT verification (the default):
//   supabase functions deploy download-url
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "product-files";
const URL_TTL_SECONDS = 300;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Not signed in" }, 401);

    const { file_id } = await req.json();
    if (!file_id) return json({ error: "file_id is required" }, 400);

    // RLS does the entitlement check for us.
    const { data: file, error: fileErr } = await userClient
      .from("product_files")
      .select("id, display_name, storage_path, product_id")
      .eq("id", file_id)
      .maybeSingle();

    if (fileErr) throw fileErr;
    if (!file) {
      // Same answer whether the file is missing or simply not theirs —
      // no hints about what exists.
      return json({ error: "You do not have access to that file" }, 403);
    }

    // Only the service key may read the private bucket.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, URL_TTL_SECONDS, {
        download: `RK Aesthetics - ${file.display_name}.pdf`,
      });

    if (signErr || !signed) throw signErr ?? new Error("No signed URL returned");

    // Audit trail — a shared login shows up here first.
    await admin.from("download_events").insert({
      user_id: user.id,
      file_id: file.id,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: req.headers.get("user-agent"),
    });

    return json({
      url: signed.signedUrl,
      filename: `RK Aesthetics - ${file.display_name}.pdf`,
      expires_in: URL_TTL_SECONDS,
    });
  } catch (err) {
    console.error("download-url failed:", err);
    return json({ error: "Something went wrong" }, 500);
  }
});

// Turning a paid order into short-lived download links.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "product-files";
export const URL_TTL_SECONDS = 900; // 15 minutes

export interface SignedFile {
  name: string;
  filename: string;
  url: string;
}

/* Every file the order entitles the buyer to, bundles expanded and
   de-duplicated, as signed URLs. Callers must have already checked
   that the order is paid. */
export async function signedFilesForOrder(
  admin: SupabaseClient,
  orderId: string,
): Promise<SignedFile[]> {
  const { data: items, error: itemsErr } = await admin
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  if (itemsErr) throw itemsErr;

  const productIds = new Set((items ?? []).map((i) => i.product_id));

  // A bundle entitles the buyer to everything inside it.
  const { data: contents, error: bundleErr } = await admin
    .from("bundle_items")
    .select("bundle_id, product_id")
    .in("bundle_id", [...productIds]);
  if (bundleErr) throw bundleErr;
  (contents ?? []).forEach((row) => productIds.add(row.product_id));

  const { data: files, error: filesErr } = await admin
    .from("product_files")
    .select("display_name, storage_path, sort_order")
    .in("product_id", [...productIds])
    .order("sort_order");
  if (filesErr) throw filesErr;

  const seen = new Set<string>();
  const out: SignedFile[] = [];

  for (const f of files ?? []) {
    if (seen.has(f.storage_path)) continue;
    seen.add(f.storage_path);

    const filename = `RK Aesthetics - ${f.display_name}.pdf`;
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(f.storage_path, URL_TTL_SECONDS, { download: filename });

    if (signErr || !signed) {
      console.error("Could not sign", f.storage_path, signErr);
      continue;
    }
    out.push({ name: f.display_name, filename, url: signed.signedUrl });
  }

  return out;
}

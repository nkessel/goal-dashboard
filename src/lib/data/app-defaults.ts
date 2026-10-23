import { supabaseAdmin } from "@/lib/supabase/server";
import { SHAREABLE_KEYS } from "@/lib/settings-defaults";

/** Every app-wide default ({} before the table exists). */
export async function listAppDefaults(): Promise<Record<string, string | null>> {
  const { data, error } = await supabaseAdmin().from("app_defaults").select("key, value");
  if (error) return {};
  return Object.fromEntries((data ?? []).filter((r) => SHAREABLE_KEYS.has(r.key as string)).map((r) => [r.key as string, (r.value as string | null) ?? null]));
}

/** Save defaults; a null value means "no setting" (the app's built-in default). */
export async function saveAppDefaults(by: string, values: Record<string, string | null>): Promise<void> {
  const rows = Object.entries(values)
    .filter(([k, v]) => SHAREABLE_KEYS.has(k) && (v === null || v.length <= 20_000))
    .map(([key, value]) => ({ key, value, updated_by: by, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await supabaseAdmin().from("app_defaults").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Couldn't save the defaults: ${error.message}`);
}

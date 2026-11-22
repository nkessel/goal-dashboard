import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isUuid } from "./pure";

// Kept in app_defaults like the other server-only `secret.*` keys: never listed as a setting (see SHAREABLE_KEYS).
const KEY = "secret.duet_key";
const OWNER = "secret.duet_owner";

async function readSecret(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("app_defaults").select("value").eq("key", key).maybeSingle<{ value: string | null }>();
  return data?.value?.trim() || null;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export type Gate = { ok: true; ownerId: string } | { ok: false; status: 401 | 503; error: string };

/** The key in the header must equal `secret.duet_key`; the owner it acts for is `secret.duet_owner`. */
export async function gate(headerKey: string | null): Promise<Gate> {
  const [key, owner] = await Promise.all([readSecret(KEY), readSecret(OWNER)]);
  if (!key) return { ok: false, status: 503, error: "Duet is switched off (no key is set)." };
  if (!owner || !isUuid(owner)) return { ok: false, status: 503, error: "Duet has no owner set." };
  // Compare fixed-length digests, so neither the length nor the content of the real key leaks through timing.
  const same = headerKey !== null && timingSafeEqual(digest(headerKey), digest(key));
  if (!same) return { ok: false, status: 401, error: "Wrong key." };
  return { ok: true, ownerId: owner };
}

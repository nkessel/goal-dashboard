import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Save ONE key of `profiles.life_wheel` in the database (migration 0093, `set_profile_extra`), so a
 * save never writes back a stale copy of the other keys. Returns `{ error }` like a Supabase call.
 * An `undefined` value removes the key. Never write the whole `life_wheel` from the app.
 */
export async function writeExtra(ownerId: string, key: string, value: unknown) {
  const { error } = await supabaseAdmin().rpc("set_profile_extra", { p_owner: ownerId, p_key: key, p_value: value === undefined ? null : value });
  return { error };
}

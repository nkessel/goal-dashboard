import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Which Google calendars show on the Quest Calendar, and the folders they're
 * grouped into on the left. Kept on the profile (migration 0057); until that
 * column exists, in a cookie on this browser.
 */
export type CalendarPrefs = {
  /** Explicit on/off per calendar id; missing = whatever Google shows. */
  on: Record<string, boolean>;
  folders: { name: string; open: boolean }[];
  /** calendar id → folder name. */
  placement: Record<string, string>;
};

export const EMPTY_PREFS: CalendarPrefs = { on: {}, folders: [], placement: {} };
const COOKIE = "cal-prefs";

function clean(raw: unknown): CalendarPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CalendarPrefs>;
  const on: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(r.on ?? {})) if (typeof v === "boolean") on[k.slice(0, 300)] = v;
  const folders = (Array.isArray(r.folders) ? r.folders : [])
    .filter((f) => f && typeof f.name === "string" && f.name.trim())
    .slice(0, 30)
    .map((f) => ({ name: f.name.replace(/\s+/g, " ").trim().slice(0, 40), open: f.open !== false }));
  const names = new Set(folders.map((f) => f.name));
  const placement: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.placement ?? {})) if (typeof v === "string" && names.has(v)) placement[k.slice(0, 300)] = v;
  return { on, folders, placement };
}

export async function getCalendarPrefs(ownerId: string): Promise<CalendarPrefs> {
  const { data, error } = await supabaseAdmin().from("profiles").select("calendar_sources").eq("id", ownerId).maybeSingle<{ calendar_sources: unknown }>();
  if (!error) return data?.calendar_sources ? clean(data.calendar_sources) : await fromCookie();
  return fromCookie();
}

async function fromCookie(): Promise<CalendarPrefs> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    return raw ? clean(JSON.parse(raw)) : EMPTY_PREFS;
  } catch {
    return EMPTY_PREFS;
  }
}

/** Save (server actions only — the cookie fallback needs a response to set it on). */
export async function saveCalendarPrefs(ownerId: string, prefs: CalendarPrefs): Promise<void> {
  const value = clean(prefs);
  const { error } = await supabaseAdmin().from("profiles").update({ calendar_sources: value }).eq("id", ownerId);
  if (!error) return;
  if (!/calendar_sources/.test(error.message)) throw new Error(`Couldn't save your calendars: ${error.message}`);
  (await cookies()).set(COOKIE, JSON.stringify(value), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}

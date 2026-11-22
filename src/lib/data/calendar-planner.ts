import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appTimeZone } from "@/lib/data/tomorrow";

/**
 * Calendar planner step 3 (docs/CALENDAR-PLANNER-DESIGN.md 2b, migration 0098): keeps the new columns and tables
 * in step with the old keys (`life_wheel.questDrives`, `scheduler.essentialDays`) until step 4 switches readers over.
 * Every function logs its errors and never throws, so the old path can't break.
 */

/** Wall-clock minutes on a "YYYY-MM-DD" day in the app's zone, as an ISO moment (DST-safe). */
function zonedISO(day: string, minutes: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: appTimeZone(), hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]));
  const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess - (asLocal - guess)).toISOString();
}

/** A quest's drive time (both ways), mirrored into its travel columns. `null` clears it. */
export async function mirrorQuestDrive(ownerId: string, taskId: string, minutes: number | null) {
  try {
    const m = minutes && minutes > 0 ? Math.min(600, Math.round(minutes)) : 0;
    const { error } = await supabaseAdmin().from("tasks").update({ travel_before_min: m, travel_after_min: m }).eq("id", taskId).eq("owner_id", ownerId);
    if (error) console.error("mirrorQuestDrive:", error.message);
  } catch (e) {
    console.error("mirrorQuestDrive:", e);
  }
}

type Hold = { at?: number; minutes?: number; off?: boolean };

/** `scheduler.essentialDays` as just saved, mirrored into calendar_blocks (upsert per day and key; a removed hold deletes its row). */
export async function mirrorEssentialDays(ownerId: string, essentialDays: unknown) {
  try {
    if (!essentialDays || typeof essentialDays !== "object") return;
    const db = supabaseAdmin();
    const rows: Record<string, unknown>[] = [];
    const days: string[] = [];
    for (const [day, holds] of Object.entries(essentialDays as Record<string, Record<string, Hold>>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !holds || typeof holds !== "object") continue;
      days.push(day);
      for (const [key, h] of Object.entries(holds)) {
        if (!h || typeof h !== "object") continue;
        const off = h.off === true;
        if (!off && typeof h.at !== "number") continue;
        const start = !off && typeof h.at === "number" ? Math.max(0, Math.round(h.at)) : null;
        rows.push({
          owner_id: ownerId,
          kind: key.startsWith("h:") ? "habit" : "essential",
          source_key: key,
          day,
          starts_at: start === null ? null : zonedISO(day, start),
          ends_at: start === null ? null : zonedISO(day, start + Math.max(1, Math.round(h.minutes ?? 60))),
          state: off ? "skipped" : "placed",
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (rows.length) {
      const { error } = await db.from("calendar_blocks").upsert(rows, { onConflict: "owner_id,kind,source_key,day" });
      if (error) console.error("mirrorEssentialDays:", error.message);
    }
    // Holds the owner cleared (back to floating), or whole days dropped after a week, leave no row behind.
    const keep = new Set(rows.map((r) => `${r.kind}|${r.source_key}|${r.day}`));
    const { data: old } = await db.from("calendar_blocks").select("id,kind,source_key,day").eq("owner_id", ownerId).in("kind", ["essential", "habit"]).in("day", days);
    const stale = ((old ?? []) as { id: string; kind: string; source_key: string; day: string }[]).filter((r) => !keep.has(`${r.kind}|${r.source_key}|${r.day}`)).map((r) => r.id);
    if (stale.length) await db.from("calendar_blocks").delete().in("id", stale);
  } catch (e) {
    console.error("mirrorEssentialDays:", e);
  }
}

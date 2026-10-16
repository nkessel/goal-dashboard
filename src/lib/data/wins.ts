import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Win = {
  id: string;
  kind: "quest" | "rite" | "habit" | "reward" | "journal" | "feedback";
  title: string;
  /** When it happened (ISO). */
  at: string;
  /** The rite/habit completion's own day (YYYY-MM-DD), when there is one. */
  day?: string;
  xp?: number;
  /** Journal entries: their kind ("win", "gratitude", "feedback", …). */
  sub?: string | null;
};

/** Everything you got done (or wrote down) since `sinceISO`, newest first. */
export async function listWinsSince(ownerId: string, sinceISO: string): Promise<Win[]> {
  const db = supabaseAdmin();
  const sinceDay = sinceISO.slice(0, 10);
  const [tasks, completions, rewards, journal] = await Promise.all([
    db.from("tasks").select("id, title, completed_at, xp_value, reward_id").eq("owner_id", ownerId).eq("status", "completed").gte("completed_at", sinceISO).order("completed_at", { ascending: false }).limit(300),
    db.from("rite_completions").select("id, rite_id, day, xp_awarded, completed_at").eq("owner_id", ownerId).gte("day", sinceDay).limit(500),
    db.from("rewards").select("id, title, claimed_at").eq("owner_id", ownerId).in("status", ["claimed", "completed"]).gte("claimed_at", sinceISO).limit(100),
    db.from("journal_entries").select("*").eq("owner_id", ownerId).gte("created_at", sinceISO).order("created_at", { ascending: false }).limit(200),
  ]);

  const riteIds = [...new Set((completions.data ?? []).map((c) => c.rite_id as string))];
  const rites = new Map<string, { title: string; slot: string | null }>();
  if (riteIds.length) {
    const { data } = await db.from("rites").select("id, title, slot").in("id", riteIds);
    for (const r of data ?? []) rites.set(r.id as string, { title: r.title as string, slot: (r.slot as string | null) ?? null });
  }

  const wins: Win[] = [
    ...(tasks.data ?? [])
      .filter((t) => !t.reward_id)
      .map((t) => ({ id: `q-${t.id}`, kind: "quest" as const, title: t.title as string, at: t.completed_at as string, xp: t.xp_value as number })),
    ...(completions.data ?? []).flatMap((c) => {
      const r = rites.get(c.rite_id as string);
      if (!r) return [];
      return [{ id: `r-${c.id}`, kind: r.slot === "day" ? ("habit" as const) : ("rite" as const), title: r.title, at: c.completed_at as string, day: c.day as string, xp: c.xp_awarded as number }];
    }),
    ...(rewards.data ?? []).map((r) => ({ id: `w-${r.id}`, kind: "reward" as const, title: r.title as string, at: r.claimed_at as string })),
    ...(journal.data ?? []).map((j) => {
      // Older entries carry their kind as a "[Label] " prefix instead.
      const m = !j.kind ? /^\[([^\]]+)\] /.exec(j.body as string) : null;
      const sub = (j.kind as string | null) ?? (m ? m[1].toLowerCase() : null);
      const body = m ? (j.body as string).slice(m[0].length) : (j.body as string);
      const isFeedback = sub === "feedback" || sub === "refill" || sub === "future" || sub === "app feedback" || sub === "future idea";
      return { id: `j-${j.id}`, kind: isFeedback ? ("feedback" as const) : ("journal" as const), title: body.length > 140 ? `${body.slice(0, 140)}…` : body, at: j.created_at as string, sub, ...(Number(j.xp_awarded) > 0 ? { xp: Number(j.xp_awarded) } : {}) };
    }),
  ];
  return wins.filter((w) => w.at && w.at >= sinceISO.slice(0, 10)).sort((a, b) => (a.at < b.at ? 1 : -1));
}

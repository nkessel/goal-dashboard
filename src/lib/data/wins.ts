import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Win = {
  id: string;
  kind: "quest" | "step" | "rite" | "habit" | "reward" | "journal" | "feedback" | "login";
  title: string;
  /** When it happened (ISO). */
  at: string;
  /** The rite/habit completion's own day (YYYY-MM-DD), when there is one. */
  day?: string;
  xp?: number;
  /** Journal entries: their kind ("win", "gratitude", "feedback", …). */
  sub?: string | null;
  /** A quest's or reward's portrait, when it has one. */
  icon?: string | null;
};

/** Everything you got done (or wrote down) since `sinceISO`, newest first. */
export async function listWinsSince(ownerId: string, sinceISO: string, opts: { hidePrivate?: boolean } = {}): Promise<Win[]> {
  const db = supabaseAdmin();
  const sinceDay = sinceISO.slice(0, 10);
  const [tasks, completions, rewards, journal, logins, steps] = await Promise.all([
    db.from("tasks").select("id, title, completed_at, xp_value, reward_id, icon_key, icon_source, is_private").eq("owner_id", ownerId).eq("status", "completed").gte("completed_at", sinceISO).order("completed_at", { ascending: false }).limit(300),
    db.from("rite_completions").select("id, rite_id, day, xp_awarded, completed_at").eq("owner_id", ownerId).gte("day", sinceDay).limit(500),
    db.from("rewards").select("id, title, claimed_at, icon_key").eq("owner_id", ownerId).in("status", ["claimed", "completed"]).gte("claimed_at", sinceISO).limit(100),
    db.from("journal_entries").select("*").eq("owner_id", ownerId).gte("created_at", sinceISO).order("created_at", { ascending: false }).limit(200),
    db.from("xp_events").select("id, amount, created_at").eq("owner_id", ownerId).eq("kind", "daily_check_in").gte("created_at", sinceISO).limit(60),
    // Steps (sub-quests) ticked off, even while their quest is still open.
    db.from("quest_steps").select("id, title, done_at, xp, task_id").eq("owner_id", ownerId).eq("done", true).gte("done_at", sinceISO).limit(300),
  ]);
  const stepTaskIds = [...new Set((steps.data ?? []).map((s) => s.task_id as string))];
  const stepTasks = new Map<string, { title: string; is_private: boolean | null }>();
  if (stepTaskIds.length) {
    const { data } = await db.from("tasks").select("id, title, is_private").in("id", stepTaskIds);
    for (const t of data ?? []) stepTasks.set(t.id as string, { title: t.title as string, is_private: (t.is_private as boolean | null) ?? null });
  }

  const riteIds = [...new Set((completions.data ?? []).map((c) => c.rite_id as string))];
  const rites = new Map<string, { title: string; slot: string | null }>();
  if (riteIds.length) {
    const { data } = await db.from("rites").select("id, title, slot").in("id", riteIds);
    for (const r of data ?? []) rites.set(r.id as string, { title: r.title as string, slot: (r.slot as string | null) ?? null });
  }

  const wins: Win[] = [
    ...(tasks.data ?? [])
      .filter((t) => !t.reward_id && !(opts.hidePrivate && t.is_private))
      .map((t) => ({
        id: `q-${t.id}`,
        kind: "quest" as const,
        title: t.title as string,
        at: t.completed_at as string,
        xp: t.xp_value as number,
        icon: (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? (t.icon_key as string) : null,
      })),
    ...(steps.data ?? []).flatMap((st) => {
      const t = stepTasks.get(st.task_id as string);
      if (!t || (opts.hidePrivate && t.is_private)) return [];
      return [{ id: `s-${st.id}`, kind: "step" as const, title: st.title as string, sub: t.title, at: st.done_at as string, ...(Number(st.xp) > 0 ? { xp: Number(st.xp) } : {}) }];
    }),
    ...(completions.data ?? []).flatMap((c) => {
      const r = rites.get(c.rite_id as string);
      if (!r) return [];
      return [{ id: `r-${c.id}`, kind: r.slot === "day" ? ("habit" as const) : ("rite" as const), title: r.title, at: c.completed_at as string, day: c.day as string, xp: c.xp_awarded as number }];
    }),
    ...(logins.data ?? []).map((l) => ({ id: `l-${l.id}`, kind: "login" as const, title: "Answered the call (daily login)", at: l.created_at as string, xp: Number(l.amount) || 0 })),
    ...(rewards.data ?? []).map((r) => ({ id: `w-${r.id}`, kind: "reward" as const, title: r.title as string, at: r.claimed_at as string, icon: typeof r.icon_key === "string" && r.icon_key.startsWith("http") ? (r.icon_key as string) : null })),
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

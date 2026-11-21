/**
 * The Listening list (owner, Nov 20-21; docs/plans/listening-list.md). Client-safe helpers for
 * `tasks.listen` (migration 0095): what a row is, its inner items, the Dec 22 band and pasted links.
 */

export type ListenItem = { id: string; title: string; url?: string | null; done?: boolean; doneAt?: string | null };
export type ListenReflection = { takeaway?: string; remember?: string[]; replay?: boolean; rating?: number; notes?: string; at?: string };
export type ListenData = {
  kind: "course" | "app" | "set" | "item";
  app?: "podcasts" | "youtube" | null;
  source?: string | null;
  url?: string | null;
  lessonsBoard?: string | null;
  items?: ListenItem[];
  reflections?: Record<string, ListenReflection>;
};

/** The board that is the Listening list (the old "Online learning videos" board matches too). */
export const isListenBoardTitle = (title: string | null | undefined) => !!title && /learning videos|listen/i.test(title);

const KINDS = ["course", "app", "set", "item"] as const;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** A safe http(s) link, or null. */
export function cleanUrl(raw: unknown): string | null {
  const s = clip(raw, 600);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function cleanItems(raw: unknown): ListenItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ListenItem[] = [];
  for (const r of raw.slice(0, 200)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = clip(o.id, 40) || Math.random().toString(36).slice(2, 10);
    const title = clip(o.title, 200);
    if (!title || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title, url: cleanUrl(o.url), done: o.done === true, doneAt: o.done === true && typeof o.doneAt === "string" ? o.doneAt : null });
  }
  return out;
}

export function cleanReflection(raw: unknown): ListenReflection {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rating = Math.round(Number(o.rating));
  return {
    takeaway: clip(o.takeaway, 1000) || undefined,
    remember: Array.isArray(o.remember) ? o.remember.map((x) => clip(x, 300)).filter(Boolean).slice(0, 20) : undefined,
    replay: o.replay === true,
    rating: rating >= 1 && rating <= 5 ? rating : undefined,
    notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 5000) || undefined : undefined,
    at: typeof o.at === "string" ? o.at : new Date().toISOString(),
  };
}

export function readListen(raw: unknown): ListenData {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = (KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as ListenData["kind"]) : "item";
  const reflections: Record<string, ListenReflection> = {};
  if (o.reflections && typeof o.reflections === "object") for (const [k, v] of Object.entries(o.reflections as Record<string, unknown>).slice(0, 300)) reflections[clip(k, 60)] = cleanReflection(v);
  return {
    kind,
    app: o.app === "podcasts" || o.app === "youtube" ? o.app : null,
    source: clip(o.source, 80) || null,
    url: cleanUrl(o.url),
    lessonsBoard: typeof o.lessonsBoard === "string" && /^[0-9a-f-]{36}$/i.test(o.lessonsBoard) ? o.lessonsBoard : null,
    items: cleanItems(o.items),
    reflections,
  };
}

/** Where a pasted link goes: its app, or null for an item of its own. */
export function appOfUrl(url: string): "youtube" | "podcasts" | null {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\./, "");
    if (h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com") return "youtube";
    if (h === "podcasts.apple.com" || h === "open.spotify.com" || h === "overcast.fm" || h === "pca.st") return "podcasts";
  } catch {
    /* not a link */
  }
  return null;
}

/** A readable name from a link's path, when nothing better is known ("planetary-roar" → "Planetary roar"). */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter((p) => p && !/^(id\d+|podcast|watch|playlist|[a-z]{2})$/i.test(p));
    const slug = decodeURIComponent(parts[parts.length - 1] ?? "").replace(/[-_]+/g, " ").trim();
    const name = slug && !/^\d+$/.test(slug) ? slug : u.hostname.replace(/^www\./, "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Link";
  }
}

export const newItemId = () => Math.random().toString(36).slice(2, 10);

/** How many things a row counts for, and how many are done (a lessons board's quests count when given). */
export function rowUnits(row: { status: string; l: ListenData }, lessons?: { status: string }[]): { done: number; total: number } {
  if (row.l.lessonsBoard && lessons) return { done: lessons.filter((x) => x.status === "completed").length, total: lessons.length };
  const items = row.l.items ?? [];
  if (items.length && row.l.kind !== "item") return { done: items.filter((i) => i.done).length, total: items.length };
  return { done: row.status === "completed" ? 1 : 0, total: 1 };
}

/** Weeks left until a day (at least a fraction of one), and the pace to finish by then. */
export function paceTo(deadlineISO: string, left: number, now = Date.now()): { weeks: number; perWeek: number; days: number } {
  const end = Date.parse(deadlineISO);
  const days = Math.max(0, Math.ceil((end - now) / 86400e3));
  const weeks = Math.max(days / 7, 1 / 7);
  return { weeks, perWeek: left > 0 ? Math.ceil(left / weeks) : 0, days };
}

/** The learning quotes the reflect screen opens with (owner, Nov 20: "wise quotes related to learning"). Each checked for who said it. */
export const LEARNING_QUOTES: { text: string; by: string }[] = [
  { text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", by: "Dr. Seuss" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", by: "Often credited to Benjamin Franklin; its source is unknown" },
  { text: "I am still learning.", by: "Attributed to Michelangelo (Ancora imparo)" },
  { text: "Education is not the filling of a pail, but the lighting of a fire.", by: "Often credited to W. B. Yeats; it echoes Plutarch" },
  { text: "The beautiful thing about learning is that nobody can take it away from you.", by: "B.B. King" },
  { text: "In the beginner's mind there are many possibilities, but in the expert's there are few.", by: "Shunryu Suzuki" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", by: "Often credited to Gandhi; its source is unknown" },
];

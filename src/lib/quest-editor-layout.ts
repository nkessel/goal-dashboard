/**
 * Which parts of the quest editor show straight away, which wait under its
 * "Advanced settings" fold, and in what order (kept per browser, chosen in
 * Settings). A part left in the main list among folded ones still shows,
 * just under the fold's header: that's how tags sit below it by default.
 */
export type EditorPart =
  | "showsIn"
  | "time"
  | "sequence"
  | "scheduling"
  | "steps"
  | "xp"
  | "stats"
  | "tags"
  | "progress"
  | "importance"
  | "urgency"
  | "difficulty"
  | "energy"
  | "board"
  | "standsFor"
  | "alsoOn"
  | "private"
  | "template"
  /** "Plot on the Priority Matrix", with "Not actionable yet". */
  | "matrix";

// Scheduling opens right under its "Add to calendar" / "Scheduled" button, so it isn't placed on its own.
export const EDITOR_PARTS: { key: EditorPart; label: string }[] = [
  { key: "showsIn", label: "Shows in (Today, Additional, Backlog)" },
  { key: "time", label: "Time to complete and scheduling" },
  { key: "sequence", label: "Sequence" },
  { key: "steps", label: "Steps" },
  { key: "xp", label: "XP and coins" },
  { key: "board", label: "Board" },
  { key: "stats", label: "Character stats" },
  { key: "progress", label: "Progress" },
  { key: "importance", label: "Importance" },
  { key: "urgency", label: "Urgency" },
  { key: "difficulty", label: "Difficulty" },
  { key: "energy", label: "Energy boost" },
  { key: "matrix", label: "Plot on the Priority Matrix" },
  { key: "template", label: "Save as a template" },
  // Last under More (owner, Oct 30).
  { key: "tags", label: "Tags" },
];
// Stands for and Also on live in the board tray, Private is a lock in the footer: they aren't arranged.

export type EditorLayout = { order: EditorPart[]; folded: EditorPart[]; v?: number };

export const DEFAULT_EDITOR_LAYOUT: EditorLayout = {
  order: EDITOR_PARTS.map((p) => p.key),
  folded: ["stats", "progress", "importance", "urgency", "difficulty", "energy", "matrix", "template", "tags"],
  v: 3,
};

const KEY = "quest-editor-layout";
const EVENT = "quest-editor-layout";
const known = new Set(EDITOR_PARTS.map((p) => p.key));

function clean(raw: unknown): EditorLayout {
  const r = (raw ?? {}) as Partial<EditorLayout>;
  const order = (Array.isArray(r.order) ? r.order : []).filter((k): k is EditorPart => known.has(k as EditorPart));
  // Parts added since the layout was saved go where they sit by default.
  for (const [i, p] of DEFAULT_EDITOR_LAYOUT.order.entries()) if (!order.includes(p)) order.splice(Math.min(i, order.length), 0, p);
  let folded = Array.isArray(r.folded) ? r.folded.filter((k): k is EditorPart => known.has(k as EditorPart)) : DEFAULT_EDITOR_LAYOUT.folded;
  // Layouts saved before v2: the board comes out of Advanced, and matrix plotting goes in.
  if ((r.v ?? 1) < 2) folded = [...folded.filter((k) => k !== "board"), "matrix"];
  // Before v3: tags go last, under More.
  if ((r.v ?? 1) < 3) {
    const at = order.indexOf("tags");
    if (at >= 0) order.push(...order.splice(at, 1));
    folded = [...folded.filter((k) => k !== "tags"), "tags"];
  }
  return { order: [...new Set(order)], folded: [...new Set(folded)], v: 3 };
}

let cache: { raw: string | null; value: EditorLayout } | null = null;
export function readEditorLayout(): EditorLayout {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  // Same object while nothing changed, so it can feed useSyncExternalStore.
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT_EDITOR_LAYOUT;
  try {
    if (raw) value = clean(JSON.parse(raw));
  } catch {
    /* a broken saved layout falls back to the default */
  }
  cache = { raw, value };
  return value;
}
export const serverEditorLayout = () => DEFAULT_EDITOR_LAYOUT;

export function saveEditorLayout(l: EditorLayout | null) {
  try {
    if (l) localStorage.setItem(KEY, JSON.stringify(clean(l)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function subscribeEditorLayout(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}


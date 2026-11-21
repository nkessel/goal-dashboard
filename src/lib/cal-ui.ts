/**
 * The calendar's display choices that change its first picture (days on screen, hour zoom, the early and late
 * hours, the layer switches), kept in one cookie "cal-ui-<id>" so the server draws the calendar the way it will
 * look (planner step 1d). Browser storage stays as the fallback. Pure helpers: safe on the server and in the browser.
 * Calendars hidden or ordered stay in browser storage only (the list can be long, a cookie can't hold it).
 */
export type CalUiLayers = {
  quests?: boolean;
  done?: boolean;
  allDay?: boolean;
  portraits?: boolean;
  essentials?: "dashed" | "soft" | "line" | "quest" | "hidden";
  habits?: "quest" | "dashed" | "hidden";
  card?: { art: boolean; time: boolean; xp: boolean; coins: boolean };
};
export type CalUi = {
  /** Days on screen, partway too (1 to 14). */
  span?: number;
  /** Pixels per hour. */
  zoom?: number;
  early?: boolean;
  /** Only when the person chose; otherwise the late hours follow the quests. */
  late?: boolean;
  layers?: CalUiLayers;
};

export const calUiCookie = (who: string) => `cal-ui-${who}`;

const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const pick = <T extends string>(v: unknown, ok: readonly T[]) => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : undefined);

/** Reads the cookie's value (already URL-decoded or not); anything wrong is dropped. */
export function parseCalUi(raw: string | undefined | null): CalUi {
  if (!raw) return {};
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const l = (o.layers ?? {}) as Record<string, unknown>;
    const c = l.card as Record<string, unknown> | undefined;
    const layers: CalUiLayers = {};
    const set = <K extends keyof CalUiLayers>(k: K, v: CalUiLayers[K] | undefined) => {
      if (v !== undefined) layers[k] = v;
    };
    set("quests", bool(l.quests));
    set("done", bool(l.done));
    set("allDay", bool(l.allDay));
    set("portraits", bool(l.portraits));
    set("essentials", pick(l.essentials, ["dashed", "soft", "line", "quest", "hidden"] as const));
    set("habits", pick(l.habits, ["quest", "dashed", "hidden"] as const));
    if (c && [c.art, c.time, c.xp, c.coins].every((x) => typeof x === "boolean")) set("card", { art: c.art as boolean, time: c.time as boolean, xp: c.xp as boolean, coins: c.coins as boolean });
    const out: CalUi = { span: num(o.span, 1, 14), zoom: num(o.zoom, 10, 400), early: bool(o.early), late: bool(o.late) };
    if (Object.keys(layers).length) out.layers = layers;
    for (const k of Object.keys(out) as (keyof CalUi)[]) if (out[k] === undefined) delete out[k];
    return out;
  } catch {
    return {};
  }
}

let who: string | null = null;
/** The calendar page says whose cookie to write (set once it opens). */
export function setCalUiWho(id: string) {
  who = id;
}

/** Browser only: merges a change into the cookie. Does nothing until the calendar page has said whose it is. */
export function writeCalUi(patch: CalUi) {
  if (!who || typeof document === "undefined") return;
  try {
    const name = calUiCookie(who);
    const m = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
    const cur = parseCalUi(m?.slice(name.length + 1));
    const next: CalUi = { ...cur, ...patch };
    if (patch.layers) next.layers = { ...cur.layers, ...patch.layers };
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies unavailable */
  }
}

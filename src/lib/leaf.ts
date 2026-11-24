// The leaf (cannabis) log: why, how you felt before, and the follow-up after (owner, Nov 24; mockup codes WI, WB, WR).
// Pure helpers shared by the server actions and the screens. A leaf log is a check_in_notes row with this body.

export const LEAF_EVENT = "🍃 Cannabis";
export const isLeafBody = (body: string | null | undefined) => body === LEAF_EVENT;

/** Feeling words to tap, any number (WB-1 B). One list for the log and the follow-up. */
export const FEELINGS = ["exhausted", "anxious", "restless", "low", "overwhelmed", "calm", "content"] as const;
export type Feeling = (typeof FEELINGS)[number];

export const OUTCOMES = [
  { v: "yes", label: "Yes" },
  { v: "partly", label: "Partly" },
  { v: "no", label: "No" },
] as const;
export type Outcome = (typeof OUTCOMES)[number]["v"];

export const REASON_MAX = 80;
export const AFTER_NOTE_MAX = 140;

/** What the screens need of one leaf log. */
export type LeafInfo = { id: string; at: string; reason: string | null; beforeTone: number | null; beforeFeelings: string[] };

export function cleanFeelings(x: unknown): Feeling[] {
  if (!Array.isArray(x)) return [];
  return FEELINGS.filter((f) => x.includes(f));
}
export function cleanFace(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x >= -2 && x <= 2 ? x : null;
}
export function cleanReason(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
  return t || null;
}
export function cleanOutcome(x: unknown): Outcome | null {
  return OUTCOMES.some((o) => o.v === x) ? (x as Outcome) : null;
}
export function cleanAfterNote(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/\s+/g, " ").trim().slice(0, AFTER_NOTE_MAX);
  return t || null;
}

/** A reason typed at least twice (case-insensitive, trimmed) becomes a chip: newest first, at most five (WI-2 B). Pass reasons newest first. */
export function reasonChips(reasons: (string | null | undefined)[], max = 5): string[] {
  const counts = new Map<string, number>();
  const shown = new Map<string, string>();
  const order: string[] = [];
  for (const r of reasons) {
    const t = (r ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!shown.has(k)) {
      shown.set(k, t);
      order.push(k);
    }
  }
  return order.filter((k) => (counts.get(k) ?? 0) >= 2).slice(0, max).map((k) => shown.get(k)!);
}

/** When the follow-up is first asked: 2 hours on, or 8 the next morning when logged at 9 PM or later (WR-4 A, WR-2 B). */
export function askFrom(at: Date): Date {
  if (at.getHours() >= 21) {
    const d = new Date(at);
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  }
  return new Date(at.getTime() + 2 * 3_600_000);
}
/** The line under a fresh log. */
export function askLine(at: Date): string {
  return at.getHours() >= 21 ? "I'll ask how it went tomorrow morning" : `I'll ask how it went around ${clock(askFrom(at))}`;
}
/** Ripe for the toucan: its time has come and it is under 36 hours old. */
export function toucanAsks(at: Date, now: Date): boolean {
  return now.getTime() >= askFrom(at).getTime() && now.getTime() - at.getTime() < 36 * 3_600_000;
}
export const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A leaf log from the last two days with no follow-up (the follow-up sets `tone` and `reflected_at`). */
export function leafWaits(n: { body: string; created_at: string; tone?: number | null; reflected_at?: string | null }, now: number): boolean {
  return isLeafBody(n.body) && !n.reflected_at && n.tone == null && now - Date.parse(n.created_at) < 2 * 86_400_000;
}

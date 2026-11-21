import { cleanWheel, type Hindrance } from "@/lib/wheel-of-time";

/**
 * What the check-in needs to be drawn by the server on the first paint (so Today and Insights don't
 * move once the browser has looked): the draft kept in a cookie, and whether last night is still to
 * log. Pure, shared by the server pages and the browser.
 */
export const DRAFT_COOKIE = "checkin-draft";
export type CheckInDraft = { day: string; energy: number | null; vals: Record<string, number>; journal: string; face: number | null };
export type CheckInInit = {
  /** The app day the draft belongs to. */
  dayKey: string;
  /** Last night's lists, when it is still to log today; otherwise null. */
  wheel: { effort: string[]; hindrances: string[]; pressed: { effort: string[]; hindrances: Hindrance[] } } | null;
  draft: CheckInDraft | null;
};

const MAX_COOKIE = 3500;

/** Reads the draft cookie's value (already decoded or not); null unless it is today's and well formed. */
export function parseDraft(raw: string | undefined | null, dayKey: string): CheckInDraft | null {
  if (!raw) return null;
  try {
    let text = raw;
    try {
      text = decodeURIComponent(raw);
    } catch {
      /* already decoded */
    }
    const d = JSON.parse(text) as Partial<CheckInDraft> | null;
    if (!d || d.day !== dayKey) return null;
    const vals: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.vals ?? {})) if (typeof v === "number" && Number.isFinite(v)) vals[k] = v;
    return {
      day: dayKey,
      energy: typeof d.energy === "number" ? d.energy : null,
      vals,
      journal: typeof d.journal === "string" ? d.journal : "",
      face: typeof d.face === "number" ? d.face : null,
    };
  } catch {
    return null;
  }
}

/** The cookie text for a draft, shortened (journal first) to stay under the browser's cookie size. */
export function draftCookieValue(d: CheckInDraft): string {
  let draft = d;
  let out = encodeURIComponent(JSON.stringify(draft));
  while (out.length > MAX_COOKIE && draft.journal.length > 0) {
    draft = { ...draft, journal: draft.journal.slice(0, Math.max(0, Math.floor(draft.journal.length * 0.8) - 10)) };
    out = encodeURIComponent(JSON.stringify(draft));
  }
  return out;
}

export function buildCheckInInit(lifeWheel: unknown, dayKey: string, cookie: string | undefined | null): CheckInInit {
  const wheel = cleanWheel((lifeWheel as Record<string, unknown> | null | undefined)?.wheelOfTime);
  const night = wheel.log[dayKey];
  const logged = !!(night?.bed || night?.wake);
  return {
    dayKey,
    wheel: logged ? null : { effort: wheel.effort, hindrances: wheel.hindrances, pressed: { effort: night?.effort ?? [], hindrances: night?.hindrances ?? [] } },
    draft: parseDraft(cookie, dayKey),
  };
}

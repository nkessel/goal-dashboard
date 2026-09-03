export type Interval = { start: Date; end: Date };

/**
 * v1 scheduling logic per spec: "treat all open gaps in the user's Google
 * Calendar as available — no time-of-day preferences yet (e.g. no
 * 'mornings only' or 'no lunch block'); flag this as a fast-follow feature."
 *
 * Returns up to `maxSlots` open [start, end) windows of `durationMinutes`,
 * searching forward from `from` out to `horizonDays`. Busy intervals may be
 * unsorted/overlapping; this merges them first. Slots within the same free
 * gap are packed back-to-back (start, start+duration, start+2*duration, ...)
 * rather than only offering the earliest slot per gap, so a wide-open day
 * can still fill all 3 suggestions.
 */
export function findOpenSlots(
  busy: Interval[],
  opts: {
    from: Date;
    durationMinutes: number;
    horizonDays?: number;
    maxSlots?: number;
    roundToMinutes?: number;
  }
): Interval[] {
  const horizonDays = opts.horizonDays ?? 14;
  const maxSlots = opts.maxSlots ?? 3;
  const roundToMinutes = opts.roundToMinutes ?? 15;
  const durationMs = opts.durationMinutes * 60_000;

  const horizonEnd = new Date(opts.from.getTime() + horizonDays * 86_400_000);
  const start = roundUp(opts.from, roundToMinutes);

  const merged = mergeIntervals(
    busy
      .filter((b) => b.end > start && b.start < horizonEnd)
      .map((b) => ({
        start: b.start < start ? start : b.start,
        end: b.end > horizonEnd ? horizonEnd : b.end,
      }))
  );

  const slots: Interval[] = [];
  let cursor = start;

  for (const block of merged) {
    packSlots(cursor, block.start, durationMs, maxSlots, slots);
    if (slots.length >= maxSlots) return slots;
    cursor = block.end > cursor ? block.end : cursor;
  }

  if (slots.length < maxSlots) {
    packSlots(cursor, horizonEnd, durationMs, maxSlots, slots);
  }

  return slots;
}

function packSlots(
  gapStart: Date,
  gapEnd: Date,
  durationMs: number,
  maxSlots: number,
  out: Interval[]
) {
  let t = gapStart.getTime();
  const end = gapEnd.getTime();
  while (t + durationMs <= end && out.length < maxSlots) {
    out.push({ start: new Date(t), end: new Date(t + durationMs) });
    t += durationMs;
  }
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function roundUp(date: Date, minutes: number): Date {
  const ms = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

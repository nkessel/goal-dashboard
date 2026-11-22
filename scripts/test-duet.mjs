// Checks for the pure parts of src/lib/duet/pure.ts (name resolution, weekdays, clamping, dates, ordering). Run with:
//   node --experimental-strip-types scripts/test-duet.mjs
process.env.TZ = "UTC";
const P = await import(new URL("../src/lib/duet/pure.ts", import.meta.url).href);

let bad = 0;
function eq(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(ok ? "OK:" : "FAIL:", msg, ok ? "" : `\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
}
function throws(fn, re, msg) {
  let m = null;
  try { fn(); } catch (e) { m = e.message; }
  const ok = m !== null && re.test(m);
  if (!ok) bad++;
  console.log(ok ? "OK:" : "FAIL:", msg, ok ? "" : `(got ${m})`);
}

const items = [
  { id: "11111111-1111-1111-1111-111111111111", title: "Call the plumber" },
  { id: "22222222-2222-2222-2222-222222222222", title: "Call mom" },
  { id: "33333333-3333-3333-3333-333333333333", title: "Buy milk" },
  { id: "44444444-4444-4444-4444-444444444444", title: "buy milk" },
  { id: "55555555-5555-5555-5555-555555555555", title: "Plumber invoice" },
];
// name resolution
eq(P.resolveRef(items, "call mom", "quest").item?.id, items[1].id, "exact, case-insensitive");
eq(P.resolveRef(items, "mom", "quest").item?.id, items[1].id, "unique substring");
const amb = P.resolveRef(items, "plumber", "quest");
eq([amb.ok, amb.candidates.length], [false, 2], "ambiguous substring gives candidates");
const dup = P.resolveRef(items, "BUY MILK", "quest");
eq([dup.ok, dup.candidates.length], [false, 2], "two exact matches are ambiguous, not guessed");
eq(P.resolveRef(items, "zzz", "quest").ok, false, "no match");
eq(P.resolveRef(items, "call dentist", "quest").candidates.map((c) => c.title), ["Call the plumber", "Call mom"], "near misses offered");
eq(P.resolveRef(items, items[2].id.toUpperCase(), "quest").item?.title, "Buy milk", "uuid (any case)");
eq(P.resolveRef(items, "99999999-9999-9999-9999-999999999999", "quest").ok, false, "unknown uuid");
eq(P.resolveRef(items, "  ", "quest").ok, false, "blank");
eq(P.resolveRef(Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: "task " + i })), "task", "quest").candidates.length, 5, "at most 5 candidates");
// weekdays (0 = Sunday)
eq(P.parseDays(["Mon", "wednesday", "FRI"]), [1, 3, 5], "names");
eq(P.parseDays([1, "3", 5, 5]), [1, 3, 5], "numbers, deduped");
eq(P.parseDays("weekdays"), [1, 2, 3, 4, 5], "weekdays");
eq(P.parseDays("weekends"), [0, 6], "weekends");
eq(P.parseDays([0, 1, 2, 3, 4, 5, 6]), null, "all seven = every day (stored as null)");
eq(P.parseDays([]), null, "empty = every day");
eq(P.parseDays(null), null, "null = every day");
throws(() => P.parseDays([7]), /0 \(Sunday\) to 6/, "7 rejected");
throws(() => P.parseDays(["funday"]), /isn't a weekday/, "bad name rejected");
// clamping
eq(P.clampScore(3.14159), 3.1, "score to one decimal");
eq(P.clampScore(9), 5, "score max 5");
eq(P.clampScore(-2), 0, "score min 0");
throws(() => P.clampScore("x"), /number/, "score NaN");
eq(P.clampInt(15.6, 0, 1000), 16, "int rounds");
eq(P.clampInt(5000, 0, 1000), 1000, "int cap");
// clock
eq(P.parseClock("7am"), "07:00", "7am");
eq(P.parseClock("7:30 pm"), "19:30", "7:30 pm");
eq(P.parseClock("17:05"), "17:05", "24h");
eq(P.parseClock("12am"), "00:00", "12am");
eq(P.parseClock("12pm"), "12:00", "12pm");
eq(P.parseClock(null), null, "null clears");
throws(() => P.parseClock("25:00"), /isn't a time/, "bad hour");
// due dates (New York)
eq(P.parseDue("2026-11-27"), "2026-11-28T04:59:00.000Z", "date = 23:59 New York (EST, UTC-5)");
eq(P.parseDue("2026-07-04"), "2026-07-05T03:59:00.000Z", "date in summer (EDT, UTC-4)");
eq(P.parseDue("2026-11-27T15:00"), "2026-11-27T20:00:00.000Z", "local datetime");
eq(P.parseDue("2026-03-08T03:30"), "2026-03-08T07:30:00.000Z", "after the spring-forward gap");
eq(P.parseDue("2026-11-27T15:00:00Z"), "2026-11-27T15:00:00.000Z", "explicit instant");
eq(P.parseDue(null), null, "null clears");
throws(() => P.parseDue("2026-02-30"), /isn't a date/, "impossible date rejected");
throws(() => P.parseDue("next friday"), /isn't a date/, "words rejected");
eq(P.isDay("2026-02-30"), false, "impossible day");
eq(P.weekdayOf("2026-11-22"), 0, "Nov 22 2026 is a Sunday");
// ordering
eq(P.moveAround(["a", "b", "c", "d"], "d", "b", "above"), ["a", "d", "b", "c"], "move above");
eq(P.moveAround(["a", "b", "c", "d"], "a", "c", "below"), ["b", "c", "a", "d"], "move below");
throws(() => P.moveAround(["a", "b"], "a", "a", "above"), /itself/, "not relative to itself");
throws(() => P.moveAround(["a", "b"], "a", "z", "above"), /isn't in that list/, "anchor must be in list");
eq(P.anchorOf({ below: "x" }), { ref: "x", where: "below" }, "anchorOf");
throws(() => P.anchorOf({}), /exactly one/, "anchor needed");
throws(() => P.anchorOf({ above: "a", below: "b" }), /exactly one/, "not both");

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);

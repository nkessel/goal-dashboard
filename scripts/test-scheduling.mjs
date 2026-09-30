// Unit tests for the open-slot finder (src/lib/scheduling.ts), transpiled
// on the fly since it's plain TS with no runtime deps. Run with:
//   node scripts/test-scheduling.mjs
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/scheduling.ts", import.meta.url), "utf8");
// Strip TS-only syntax with a very small transform: types are all after `:`
// on declarations we control, so just run it through esbuild if available,
// else fall back to a naive strip. Prefer esbuild (already a Next.js dep).
const jsPath = "/tmp/scheduling.mjs";
execSync(`npx --yes esbuild --format=esm src/lib/scheduling.ts --outfile=${jsPath}`, {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: "inherit",
});

const { findOpenSlots } = await import(jsPath);

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK:", msg);
}

// Test 1: no busy intervals -> first slot starts right at (rounded) `from`.
{
  const from = new Date("2026-01-05T09:03:00Z");
  const slots = findOpenSlots([], { from, durationMinutes: 30, maxSlots: 3 });
  assert(slots.length === 3, "returns 3 slots when calendar is empty");
  assert(
    slots[0].start.toISOString() === "2026-01-05T09:15:00.000Z",
    `first slot rounds up to next 15min (got ${slots[0].start.toISOString()})`
  );
  assert(
    slots[1].start.getTime() - slots[0].start.getTime() === 30 * 60_000,
    "slots pack back-to-back within an open gap"
  );
}

// Test 2: a busy block splits the day; slots should skip over it.
{
  const from = new Date("2026-01-05T09:00:00Z");
  const busy = [
    { start: new Date("2026-01-05T09:15:00Z"), end: new Date("2026-01-05T10:00:00Z") },
  ];
  const slots = findOpenSlots(busy, { from, durationMinutes: 30, maxSlots: 3 });
  assert(
    slots[0].start.toISOString() === "2026-01-05T10:00:00.000Z",
    `first slot jumps past the busy block (got ${slots[0].start.toISOString()})`
  );
}

// Test 3: overlapping busy intervals are merged correctly.
{
  const from = new Date("2026-01-05T09:00:00Z");
  const busy = [
    { start: new Date("2026-01-05T09:00:00Z"), end: new Date("2026-01-05T09:45:00Z") },
    { start: new Date("2026-01-05T09:30:00Z"), end: new Date("2026-01-05T10:15:00Z") },
  ];
  const slots = findOpenSlots(busy, { from, durationMinutes: 30, maxSlots: 1 });
  assert(
    slots[0].start.toISOString() === "2026-01-05T10:15:00.000Z",
    `overlapping busy blocks merge into one (got ${slots[0].start.toISOString()})`
  );
}

// Test 4: a slot that would only partially fit before a busy block is skipped.
{
  const from = new Date("2026-01-05T09:00:00Z");
  const busy = [
    { start: new Date("2026-01-05T09:20:00Z"), end: new Date("2026-01-05T11:00:00Z") },
  ];
  const slots = findOpenSlots(busy, { from, durationMinutes: 30, maxSlots: 1 });
  assert(
    slots[0].start.toISOString() === "2026-01-05T11:00:00.000Z",
    `15-min gap (too short for 30-min task) is skipped entirely (got ${slots[0].start.toISOString()})`
  );
}

console.log("\nAll scheduling tests passed.");

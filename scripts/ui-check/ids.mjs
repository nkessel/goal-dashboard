// Row ids for the fake database. Random normally; in snapshot mode (UI_CHECK_CLOCK_AT set)
// they count up from a fixed start, so two runs give the same rows the same ids and the
// before/after compare sees no difference (S1).
import { randomUUID } from "node:crypto";

const counters = new Map();

/** A new id. `scope` keeps fixture ids and ids made by writes apart. */
export function newId(scope = "f") {
  if (!process.env.UI_CHECK_CLOCK_AT) return randomUUID();
  const n = (counters.get(scope) || 0) + 1;
  counters.set(scope, n);
  const tag = scope === "f" ? "f" : "e";
  return `00000000-0000-4000-8${tag}00-${n.toString(16).padStart(12, "0")}`;
}

/** Start counting again (each reseed of the fake database). */
export function resetIds() {
  counters.clear();
}

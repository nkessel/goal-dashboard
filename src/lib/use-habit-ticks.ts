"use client";

import { useSyncExternalStore } from "react";
import { habitTicksAction } from "@/app/actions";
import type { HabitTicksSeed } from "@/lib/habit-ticks";

// Which habits count every tick and today's extra ticks: sent with Today (so cards are right from the first
// paint), then kept here as you tick (kept on the account, `life_wheel.habitTicks`).
type State = { many: string[]; today: Record<string, number>; loaded: boolean };
const EMPTY: State = { many: [], today: {}, loaded: false };
let state: State = EMPTY;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const seeds = new WeakMap<object, State>();
function seeded(seed?: HabitTicksSeed | null): State {
  if (!seed) return EMPTY;
  let s = seeds.get(seed);
  if (!s) seeds.set(seed, (s = { many: seed.many, today: seed.today, loaded: true }));
  return s;
}
function current(seed?: HabitTicksSeed | null): State {
  if (seed && !state.loaded) state = seeded(seed);
  return state;
}

export function setHabitTicks(next: Partial<Pick<State, "many" | "today">>) {
  state = { ...state, ...next };
  subs.forEach((f) => f());
}
export const habitTicksNow = () => state;

export function useHabitTicks(day: string | null | undefined, seed?: HabitTicksSeed | null) {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      if (!state.loaded && !seed && day)
        loading ??= habitTicksAction(day)
          .then((r) => setHabitTicks({ many: r.many, today: r.today }))
          .catch(() => {})
          .then(() => {
            state = { ...state, loaded: true };
          });
      return () => subs.delete(cb);
    },
    () => current(seed),
    () => seeded(seed)
  );
}

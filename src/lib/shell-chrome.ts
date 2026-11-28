"use client";

// The buttons that float over every screen (the +, the feedback chat, the focus timer pill) live in one
// host in the root layout instead of inside each screen, so they stay on screen and keep their state
// while a tab's stand-in gives way to its real screen (TI-6, owner Nov 27). Screens tell the host what to
// show; a navigation to another screen still starts them fresh, as when each screen drew its own.
import { useLayoutEffect, useSyncExternalStore } from "react";
import type { CreateKind } from "@/components/create/CreateSheet";

export type ShellLook = { theme: "calm" | "adventure" };
export type FabProps = {
  resumeDraft?: boolean;
  kinds: CreateKind[];
  initial?: CreateKind;
  boardId?: string;
  todayFull?: boolean;
  theme?: "calm" | "adventure";
  label?: string;
};

type State = { look: ShellLook | null; holds: number; gen: number; fab: FabProps | null };
let state: State = { look: null, holds: 0, gen: 0, fab: null };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
const serverState: State = { look: null, holds: 0, gen: 0, fab: null };
export function useShellChrome() {
  return useSyncExternalStore(subscribe, () => state, () => serverState);
}

// A stand-in that just gave way, and the path it stood in for: the real screen of that same path
// carries on with the chrome as it was (no fresh start).
let leftStandIn: string | null = null;
function arrive(kind: "shell" | "standin") {
  const path = window.location.pathname;
  const carriesOn = kind === "shell" && leftStandIn === path;
  leftStandIn = null;
  return carriesOn ? state.gen : state.gen + 1;
}

/**
 * Keeps the floating buttons on while this screen (or stand-in) shows. A stand-in passes no look: it
 * keeps the one the last screen gave.
 */
export function useChromeHold(kind: "shell" | "standin", look?: ShellLook) {
  const theme = look?.theme;
  useLayoutEffect(() => {
    set({ holds: state.holds + 1, gen: arrive(kind) });
    return () => {
      if (kind === "standin") {
        const path = window.location.pathname;
        leftStandIn = path;
        // Only the screen that replaces it in the same commit carries on.
        queueMicrotask(() => {
          if (leftStandIn === path) leftStandIn = null;
        });
      }
      set({ holds: state.holds - 1 });
    };
  }, [kind]);
  useLayoutEffect(() => {
    if (theme) set({ look: { theme } });
  }, [theme]);
}

// The + : the screen's latest wish wins; when it goes, the one under it shows again.
const fabs: { id: number; props: FabProps }[] = [];
let nextId = 1;
function topFab() {
  return fabs.length ? fabs[fabs.length - 1].props : null;
}
export function useRegisterFab(props: FabProps) {
  const { resumeDraft, initial, boardId, todayFull, theme, label } = props;
  const kindsKey = props.kinds.join(",");
  useLayoutEffect(() => {
    const id = nextId++;
    fabs.push({ id, props: { resumeDraft, kinds: kindsKey.split(",") as CreateKind[], initial, boardId, todayFull, theme, label } });
    set({ fab: topFab() });
    return () => {
      const i = fabs.findIndex((f) => f.id === id);
      if (i >= 0) fabs.splice(i, 1);
      set({ fab: topFab() });
    };
  }, [resumeDraft, kindsKey, initial, boardId, todayFull, theme, label]);
}

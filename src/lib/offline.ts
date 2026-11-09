"use client";

import { useSyncExternalStore } from "react";
import {
  addJournalEntryAction,
  completeRiteAction,
  completeTaskAction,
  createQuestAction,
  logEventAction,
  makeRefillQuestAction,
  saveCheckInAction,
  saveInventoryAction,
  savePackingListsAction,
  saveQuestStepsAction,
  setTaskPlacementAction,
  setTaskTagsAction,
  tickRiteStepAction,
  uncompleteRiteAction,
  updateTaskAction,
} from "@/app/actions";
import { resolveOptimisticQuest } from "@/lib/optimistic-quests";

/**
 * Working offline (owner, Nov 6: "so the user can add and edit lists, inventory items, and even
 * quests while offline"). A change made without a connection (or whose save hits a dropped one) is
 * kept on this device in a queue and sent, in order, once the app is back online. Changes to the same
 * thing (the whole backpack, the packing lists, one quest's details) replace each other in the queue,
 * so only the latest is sent. The screens themselves come from public/sw.js.
 */

type CreateQuestInput = Parameters<typeof createQuestAction>[0];
type UpdateQuestInput = Parameters<typeof updateTaskAction>[1];
type StepInput = Parameters<typeof saveQuestStepsAction>[1];

/** Everything that can wait for a connection, by name (names survive a deploy; action ids don't). */
const RUNNERS = {
  saveInventory: (inv: unknown) => saveInventoryAction(inv),
  savePacking: (lists: unknown) => savePackingListsAction(lists),
  refillQuest: (name: string) => makeRefillQuestAction(name),
  createQuest: async (a: { tempId: string; input: CreateQuestInput; tags?: string[]; steps?: StepInput }) => {
    const id = await createQuestAction(a.input);
    if (a.tags?.length) await setTaskTagsAction(id, a.tags).catch(() => {});
    if (a.steps?.length) await saveQuestStepsAction(id, a.steps).catch(() => {});
    resolveOptimisticQuest(a.tempId, id);
    return id;
  },
  updateQuest: (a: { id: string; input: UpdateQuestInput }) => updateTaskAction(a.id, a.input),
  placeQuest: (a: { id: string; placement: "today" | "additional" | "none" }) => setTaskPlacementAction(a.id, a.placement),
  questSteps: (a: { id: string; steps: StepInput }) => saveQuestStepsAction(a.id, a.steps),
  completeQuest: (a: { id: string; at: string }) => {
    const fd = new FormData();
    fd.set("taskId", a.id);
    // Done on an earlier day: it shows in that day's victories, marked with its day.
    if (new Date(a.at).toDateString() !== new Date().toDateString()) fd.set("completedAt", a.at);
    return completeTaskAction(fd);
  },
  // Habits, check-ins, events and journal notes (owner, Nov 9: "increase what the user can do while offline").
  completeRite: (a: { id: string; day: string; pct?: number }) => completeRiteAction(a.id, a.day, a.pct ?? 100),
  uncompleteRite: (a: { id: string; day: string }) => uncompleteRiteAction(a.id, a.day),
  tickStep: (a: { id: string; stepId: string; day: string; on: boolean }) => tickRiteStepAction(a.id, a.stepId, a.day, a.on),
  saveCheckIn: (a: { energy: number | null; metrics: { metric: string; level: number }[]; at: string }) => saveCheckInAction(a.energy, a.metrics, a.at),
  logEvent: async (a: Parameters<typeof logEventAction>[0]) => {
    const r = await logEventAction(a);
    // logEventAction reports problems as a result; a refusal shouldn't retry forever.
    if (!r.ok) throw new Error(r.error);
    return r;
  },
  journal: (a: { body: string; mood: number | null; kind: string | null }) => addJournalEntryAction(a.body, a.mood, a.kind),
};

export type OfflineKind = keyof typeof RUNNERS;
type ArgsOf<K extends OfflineKind> = Parameters<(typeof RUNNERS)[K]>[0];
type ResultOf<K extends OfflineKind> = Awaited<ReturnType<(typeof RUNNERS)[K]>>;

export type OfflineOp = { id: string; kind: OfflineKind; args: unknown; key?: string; owner: string | null; at: string };
export type OfflineState = {
  ops: OfflineOp[];
  online: boolean;
  syncing: boolean;
  /** When everything waiting last went through (ms), for a short "✓ Synced". */
  syncedAt: number;
  /** Changes the server turned down (not a connection problem). */
  failed: { what: string; why: string }[];
};

const QUEUE_KEY = "offline-queue-v1";
let owner: string | null = null;
let state: OfflineState = { ops: [], online: true, syncing: false, syncedAt: 0, failed: [] };
let loaded = false;
const listeners = new Set<() => void>();

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  if (patch.ops) {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(state.ops));
    } catch {
      /* storage full or blocked: the queue still lives in memory */
    }
  }
  listeners.forEach((l) => l());
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  let ops: OfflineOp[] = [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
    if (Array.isArray(raw)) ops = raw.filter((o) => o && typeof o.kind === "string" && o.kind in RUNNERS);
  } catch {
    /* nothing kept */
  }
  state = { ...state, ops, online: navigator.onLine !== false };
}

/** The signed-in account (from AppShell): changes are only ever sent for the account that made them. */
export function setOfflineOwner(id: string | null) {
  load();
  owner = id;
}

export const offlineOwner = () => owner;

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** A save that never reached the server (no connection, or it dropped mid-way). */
export function isNetworkError(e: unknown) {
  if (isOffline()) return true;
  // Only the browser's own "couldn't reach it" (a TypeError from fetch), never a message the server
  // sent back (those can mention "fetch failed" from its own database call).
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return e instanceof TypeError && /failed to fetch|load failed|networkerror|network connection was lost|internet connection appears to be offline|network request failed/i.test(msg);
}

/** Wait for a connection: put it in the queue (replacing an older change to the same thing). */
export function queueOffline<K extends OfflineKind>(kind: K, args: ArgsOf<K>, key?: string) {
  load();
  const op: OfflineOp = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, kind, args, key, owner, at: new Date().toISOString() };
  const ops = key ? state.ops.filter((o) => o.key !== key) : state.ops;
  set({ ops: [...ops, op], online: !isOffline() ? state.online : false });
  if (!isOffline()) scheduleRetry(800);
}

/**
 * Save now if there's a connection, else keep it for later. Returns `{ queued: true }` when it waits
 * (the caller keeps its own change on screen and moves on), or the action's own result.
 */
export async function saveOrQueue<K extends OfflineKind>(kind: K, args: ArgsOf<K>, key?: string): Promise<{ queued: true } | { queued: false; result: ResultOf<K> }> {
  load();
  // Something about the same thing is still waiting: wait behind it, so they land in order.
  if (isOffline() || (key && state.ops.some((o) => o.key === key))) {
    queueOffline(kind, args, key);
    return { queued: true };
  }
  try {
    const result = (await (RUNNERS[kind] as (a: ArgsOf<K>) => Promise<ResultOf<K>>)(args)) as ResultOf<K>;
    return { queued: false, result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    queueOffline(kind, args, key);
    return { queued: true };
  }
}

/** The newest waiting change for `key` (e.g. the backpack as last edited offline), if any. */
export function pendingFor<T>(key: string): T | undefined {
  load();
  const op = [...state.ops].reverse().find((o) => o.key === key && (!owner || !o.owner || o.owner === owner));
  return op ? (op.args as T) : undefined;
}

const WHAT: Record<OfflineKind, string> = {
  saveInventory: "Backpack",
  savePacking: "Packing lists",
  refillQuest: "Refill quest",
  createQuest: "New quest",
  updateQuest: "Quest changes",
  placeQuest: "Quest's place",
  questSteps: "Sub-quests",
  completeQuest: "Completed quest",
  completeRite: "Habit done",
  uncompleteRite: "Habit undone",
  tickStep: "Sub-habit",
  saveCheckIn: "Check-in",
  logEvent: "Event",
  journal: "Journal note",
};

let retry: ReturnType<typeof setTimeout> | undefined;
function scheduleRetry(ms = 15000) {
  clearTimeout(retry);
  retry = setTimeout(() => void flushOffline(), ms);
}

/** Send everything waiting, oldest first. Stops at the first lost connection and tries again later. */
export async function flushOffline(): Promise<number> {
  load();
  if (state.syncing || isOffline() || !owner) return 0;
  const mine = () => state.ops.filter((o) => !o.owner || o.owner === owner);
  if (!mine().length) return 0;
  set({ syncing: true, online: true });
  let sent = 0;
  try {
    for (;;) {
      const op = mine()[0];
      if (!op) break;
      try {
        await (RUNNERS[op.kind] as (a: unknown) => Promise<unknown>)(op.args);
        sent++;
        set({ ops: state.ops.filter((o) => o.id !== op.id) });
      } catch (e) {
        if (isNetworkError(e)) {
          scheduleRetry();
          break;
        }
        const why = e instanceof Error ? e.message : "The server turned it down.";
        // A new version of the app went live while this page was open: its save buttons changed
        // names. Reload once (the queue is kept) and send from the new version.
        if (/server action|older or newer deployment|not found on the server/i.test(why)) {
          try {
            if (!sessionStorage.getItem("offline-reloaded")) {
              sessionStorage.setItem("offline-reloaded", "1");
              window.location.reload();
              return sent;
            }
          } catch {
            /* fall through: report it */
          }
        }
        if (op.kind === "createQuest") resolveOptimisticQuest((op.args as { tempId: string }).tempId, null, why);
        set({ ops: state.ops.filter((o) => o.id !== op.id), failed: [...state.failed, { what: WHAT[op.kind], why }].slice(-5) });
      }
    }
  } finally {
    set({ syncing: false, syncedAt: sent && !mine().length ? Date.now() : state.syncedAt });
  }
  if (sent) {
    try {
      sessionStorage.removeItem("offline-reloaded");
    } catch {}
    window.dispatchEvent(new Event("offline-synced"));
  }
  return sent;
}

export function setOnline(online: boolean) {
  load();
  if (online !== state.online) set({ online });
}

export function dismissOfflineFailures() {
  set({ failed: [] });
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: OfflineState = { ops: [], online: true, syncing: false, syncedAt: 0, failed: [] };

export function useOfflineState(): OfflineState {
  return useSyncExternalStore(subscribe, () => (load(), state), () => SERVER);
}

/** When this page was opened: quests ticked off since then play their own done animation instead. */
const OPENED_AT = new Date().toISOString();

/** Quests ticked off offline before this page opened (hidden from Today's lists until the server has them). */
export function useOfflineDone(): Set<string> {
  const s = useOfflineState();
  return doneSet(s.ops);
}
let doneCache: { ops: OfflineOp[]; set: Set<string> } = { ops: [], set: new Set() };
function doneSet(ops: OfflineOp[]) {
  if (doneCache.ops !== ops) doneCache = { ops, set: new Set(ops.filter((o) => o.kind === "completeQuest" && o.at < OPENED_AT).map((o) => (o.args as { id: string }).id)) };
  return doneCache.set;
}

/** A quest's details as last edited offline, laid over what the (possibly kept) screen shows. */
export function useOfflineQuest<T extends { id: string }>(task: T): T {
  const s = useOfflineState();
  if (!s.ops.length) return task;
  const op = [...s.ops].reverse().find((o) => o.kind === "updateQuest" && (o.args as { id: string }).id === task.id);
  if (!op) return task;
  const i = (op.args as { input: UpdateQuestInput }).input;
  return {
    ...task,
    title: i.title,
    description: i.description,
    importance: i.importance,
    urgency: i.urgency,
    xp_value: i.xpValue,
    ...(i.estimateMinutes !== undefined ? { estimate_minutes: i.estimateMinutes } : {}),
    ...(i.dueAt !== undefined ? { due_at: i.dueAt } : {}),
    ...(i.isTiny !== undefined ? { is_tiny: i.isTiny } : {}),
  };
}

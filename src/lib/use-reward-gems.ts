"use client";

import { useSyncExternalStore } from "react";
import { rewardGemsAction, setRewardGemAction } from "@/app/actions";
import type { GemKind } from "@/components/ui/Gem";

// Which gem each reward wears (`life_wheel.rewardGems`, by reward id), read once per page load when a reward shows.
let gems: Record<string, GemKind> = {};
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function subscribe(cb: () => void) {
  subs.add(cb);
  loading ??= rewardGemsAction()
    .then((g) => {
      gems = { ...g, ...gems };
      emit();
    })
    .catch(() => {});
  return () => subs.delete(cb);
}
const none = () => () => {};

export function useRewardGem(rewardId: string | null | undefined): GemKind {
  return useSyncExternalStore(rewardId ? subscribe : none, () => (rewardId ? (gems[rewardId] ?? "diamond") : "diamond"), () => "diamond");
}

export function saveRewardGem(rewardId: string, kind: GemKind) {
  gems = { ...gems, [rewardId]: kind };
  emit();
  return setRewardGemAction(rewardId, kind);
}

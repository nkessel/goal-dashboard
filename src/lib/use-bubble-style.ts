"use client";

import { useSyncExternalStore } from "react";
import { readBubbleLook, readBubbleWay, subscribeBubbleStyle, type BubbleLook, type BubbleWay } from "@/lib/toucan-flourish";

/** The chosen look and way of the toucan's speech bubbles (both "mixed" until chosen). */
export function useBubbleStyle(): { look: BubbleLook; way: BubbleWay } {
  const look = useSyncExternalStore(subscribeBubbleStyle, readBubbleLook, () => "mixed" as const);
  const way = useSyncExternalStore(subscribeBubbleStyle, readBubbleWay, () => "mixed" as const);
  return { look, way };
}

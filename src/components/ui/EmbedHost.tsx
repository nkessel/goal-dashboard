"use client";

import { createContext, useContext } from "react";

/**
 * When set, dialogs render inside this element (e.g. the + sheet) instead
 * of floating over the page — same editor, no second overlay.
 */
export const EmbedHostContext = createContext<HTMLElement | null>(null);

export function usePortalTarget(): HTMLElement {
  const host = useContext(EmbedHostContext);
  return host ?? document.body;
}

export function useIsEmbedded(): boolean {
  return useContext(EmbedHostContext) !== null;
}

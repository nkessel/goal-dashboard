import type { CSSProperties } from "react";

/** The editor's shared looks. Those that depend on the card's style are functions of it. */
export const LABEL_CLS = "text-[13px] font-semibold";

/** The border colour of the editor's chips and fields. */
export function chipBorderFor(isAdventure: boolean): string {
  return isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";
}

/** The look of the editor's text fields and boxes. */
export function fieldStyleFor(isAdventure: boolean): CSSProperties {
  return {
    borderColor: chipBorderFor(isAdventure),
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };
}

/** The small toolbar buttons (templates, drafts): roomier inside the + sheet's scrolling row. */
export function smallBtnClass(toolbarHost: boolean): string {
  return toolbarHost
    ? "create-kind flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
    : "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold";
}

"use client";

import { GearIcon, CloseIcon } from "@/components/ui/Icons";

/** The bar that stays put at the top while the editor scrolls: the quest's own title, the templates and drafts buttons (when they are not in the + sheet), the gear that arranges the editor in place, and close. */
export function EditorHeader({ isAdventure, heading, toolbar, arranging, setArranging, requestClose }: {
  isAdventure: boolean;
  heading: React.ReactNode;
  toolbar: React.ReactNode;
  arranging: boolean;
  setArranging: (b: boolean) => void;
  requestClose: () => void;
}) {
  return (
    <>
      {/* Stays put while scrolling, small and out of the way. */}
      <div
        data-embed-hide
        className="sticky -top-4 z-20 -mx-4 -mb-1.5 -mt-4 flex items-center justify-between px-4 pb-1 pt-1.5"
        style={{ background: `linear-gradient(180deg, ${isAdventure ? "var(--t-panel)" : "var(--t-card)"} 70%, transparent)` }}
      >
        {/* The quest's own title stays at the top while you scroll. */}
        <h3 className={`m-0 min-w-0 flex-1 truncate pr-2 text-[15px] ${isAdventure ? "font-display" : "font-bold"}`} style={{ color: "var(--t-ink-soft)" }}>
          {heading}
        </h3>
        {toolbar}
        {/* The gear arranges the editor right here: which parts show, and in what order. */}
        <button
          type="button"
          onClick={() => setArranging(!arranging)}
          aria-pressed={arranging}
          aria-label={arranging ? "Done arranging" : "Arrange the editor"}
          title={arranging ? "Done arranging" : "Arrange the editor"}
          className="settings-gear ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
          style={{ color: "var(--t-ink-soft)", background: arranging ? "rgba(217,180,95,.3)" : undefined }}
        >
          <GearIcon size={18} />
        </button>
        <button type="button" onClick={requestClose} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
          <CloseIcon size={13} />
        </button>
      </div>
    </>
  );
}

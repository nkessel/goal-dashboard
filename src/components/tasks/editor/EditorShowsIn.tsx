"use client";



/** Where it shows on Today: Today's Quests, Additional Quests, or the backlog (just its board). One choice; the choice stays with the dialog. */
export function EditorShowsIn({ doingNow, isCompleted, fixedSchedule, isAdventure, labelCls, placement, setPlacement }: {
  doingNow: boolean;
  isCompleted: boolean;
  fixedSchedule: unknown;
  isAdventure: boolean;
  labelCls: string;
  placement: "today" | "additional" | "none";
  setPlacement: (v: "today" | "additional" | "none") => void;
}) {
  return (
    <>
    {/* Where it shows on Today: Today's Quests, Additional Quests, or the backlog (just its board). One choice. */}
    {!doingNow && !isCompleted && !fixedSchedule && (
      <div className="flex items-center gap-2">
        <span className={`${labelCls} shrink-0`}>Priority</span>
        <div
          role="radiogroup"
          aria-label="Priority: primary objective (Today's Quests), secondary objective (Additional Quests) or backlog (only on its board)"
          className="grid min-h-9 min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-[18px] p-[3px]"
          style={{ background: "rgba(70,50,20,.09)", boxShadow: "inset 0 1px 2px rgba(70,50,20,.14)" }}
        >
          {(
            [
              { v: "today" as const, label: `Primary objective: shows in Today's ${isAdventure ? "Quests" : "Tasks"}`, short: "Primary objective" },
              { v: "additional" as const, label: `Secondary objective: shows in Additional ${isAdventure ? "Quests" : "Tasks"}`, short: "Secondary objective" },
              { v: "none" as const, label: "Backlog: only on its board", short: "Backlog" },
            ]
          ).map((o) => {
            const on = placement === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={o.label}
                title={o.label}
                onClick={() => setPlacement(o.v)}
                className="flex min-h-[30px] min-w-0 items-center justify-center gap-1 rounded-[15px] px-1.5 py-0.5 text-[12px] font-semibold leading-[1.1] transition-[background,box-shadow] duration-150"
                style={{
                  background: on ? (isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-card)") : "transparent",
                  boxShadow: on ? "0 1px 3px rgba(60,40,10,.3), 0 0 0 1px rgba(138,97,22,.55)" : undefined,
                  color: on ? "#2a1c10" : "var(--t-ink-soft)",
                }}
              >
                <span
                  aria-hidden
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                  style={{ border: `1.5px solid ${on ? "#6b4a12" : "rgba(110,90,50,.55)"}` }}
                >
                  {on && <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "#6b4a12" }} />}
                </span>
                <span className="text-left">{o.short}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}

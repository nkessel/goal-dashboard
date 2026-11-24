"use client";



/** Plot on the Priority Matrix, with "not actionable yet" beside it. The aspiration flag stays with the dialog. */
export function EditorMatrix({ task, isCompleted, onPlot, chipBorder, isAdventure, aspiration, setAspiration }: {
  task: { id: string } | null | undefined;
  isCompleted: boolean;
  onPlot?: () => void;
  chipBorder: string;
  isAdventure: boolean;
  aspiration: boolean;
  setAspiration: (b: boolean) => void;
}) {
  return (
    <>
    {/* Plot on the matrix, with "not actionable yet" beside it */}
    {task && !isCompleted && (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (onPlot) onPlot();
            else window.location.assign(`/matrix?plot=${task.id}`);
          }}
          className="hover-glow flex min-h-9 items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-semibold"
          style={{ borderColor: chipBorder, color: "var(--t-ink)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- matrix glyph */}
          <img src="/design/ui-target.png" alt="" width={18} height={18} />
          Plot on the Priority Matrix
        </button>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px]" title="Keep it as an aspiration on its board, off Today and the map">
          <input type="checkbox" checked={aspiration} onChange={(e) => setAspiration(e.target.checked)} className="h-4 w-4 shrink-0" style={{ accentColor: isAdventure ? "#8a6c2c" : "var(--t-accent)" }} />
          <span className="font-semibold">Not actionable yet</span>
        </label>
      </div>
    )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStandsForAction, setTaskAlsoOnAction } from "@/app/actions";
import { CloseIcon } from "@/components/ui/Icons";

type BoardOptions = { id: string; label: string }[] | null;

/** A stand-in quest speaks for its board's current assignment (the "Mirror the board's next quest" tick). Saves itself; nothing else reads it. */
export function EditorStandsFor({ taskId, initial, boardId, boardOptions }: { taskId: string; initial: string | null; boardId: string | null; boardOptions: BoardOptions }) {
  const router = useRouter();
  const [standsFor, setStandsFor] = useState<string | null>(initial);
  function changeStandsFor(b: string | null) {
    setStandsFor(b);
    void setStandsForAction(taskId, b).then(() => router.refresh(), () => setStandsFor(initial));
  }
  return (
    <label className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" title="Keeps this quest's name, and takes the due date, priority and next step of whichever quest is up next on the board">
      <input type="checkbox" checked={!!standsFor} onChange={(e) => changeStandsFor(e.target.checked ? (boardId ?? null) : null)} disabled={!boardId && !standsFor} />
      <span>
        Mirror the board&rsquo;s next quest <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>· takes its due date</span>
      </span>
      {standsFor && (
        <select value={standsFor} onChange={(e) => changeStandsFor(e.target.value || null)} aria-label="Which board it follows" className="h-7 max-w-[200px] rounded-full border px-2 text-[13px]" style={{ borderColor: "#b39a6a", background: "transparent", color: "var(--t-ink)" }}>
          {(boardOptions ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

/** Also show the quest on other boards (it still lives on its own board). Saves itself; nothing else reads it. */
export function EditorAlsoOn({ taskId, initial, boardId, boardOptions }: { taskId: string; initial: string[]; boardId: string | null; boardOptions: BoardOptions }) {
  const [alsoOn, setAlsoOn] = useState<string[]>(initial);
  const [alsoError, setAlsoError] = useState<string | null>(null);
  function saveAlsoOn(next: string[]) {
    const prev = alsoOn;
    setAlsoOn(next);
    setAlsoError(null);
    setTaskAlsoOnAction(taskId, next).catch((e) => {
      setAlsoOn(prev);
      setAlsoError(e instanceof Error ? e.message : "Couldn't save that.");
    });
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span style={{ color: "var(--t-ink-soft)" }}>Also on</span>
      {alsoOn.map((id) => (
        <span key={id} className="flex h-7 items-center gap-0.5 rounded-full pl-2.5 pr-0.5" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
          ↗ {boardOptions?.find((o) => o.id === id)?.label ?? "a board"}
          <button type="button" onClick={() => saveAlsoOn(alsoOn.filter((x) => x !== id))} aria-label="Unlink from this board" className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={9} />
          </button>
        </span>
      ))}
      <select
        value=""
        onChange={(e) => e.target.value && saveAlsoOn([...alsoOn, e.target.value])}
        aria-label="Also show it on another board"
        className="h-7 max-w-[180px] rounded-full border px-2 text-[13px]"
        style={{ borderColor: "#b39a6a", background: "transparent", color: "var(--t-ink)" }}
      >
        <option value="">+ another board…</option>
        {(boardOptions ?? [])
          .filter((o) => o.id !== boardId && !alsoOn.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
      </select>
      {alsoError && <span style={{ color: "var(--t-warn)" }}>{alsoError}</span>}
    </div>
  );
}

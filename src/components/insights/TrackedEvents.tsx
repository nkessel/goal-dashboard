"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCheckNoteAction, saveTrackedEventsAction, trackedEventsAction } from "@/app/actions";
import { saveOrQueue } from "@/lib/offline";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";

const INK = "#3b2a14";
const pill = { background: "rgba(233,212,154,.55)", border: "1px solid #a88a3f", color: "#2a1c10" } as const;

/**
 * Tracked events (owner, Nov 4: anti-habits as "events, but ones that I want to track, with timing recorded"):
 * named pills under the event field; a tap logs one right now (with Undo), "+ Add tracked event" names a new
 * one in place, right-click or hold a pill to remove it. Kept on the account, so phone and laptop share them.
 */
export function TrackedEvents({ onLogged }: { onLogged?: () => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [said, setSaid] = useState<{ text: string; undo?: () => void } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const hold = useRef<number | null>(null);
  useEffect(() => {
    trackedEventsAction().then(setNames, () => setNames([]));
  }, []);
  const save = (next: string[]) => {
    setNames(next);
    saveTrackedEventsAction(next).catch(() => setSaid({ text: "That didn't save. Try again?" }));
  };
  const log = async (name: string) => {
    // Stamped now, so it keeps its real time when it waits for a connection.
    const out = await saveOrQueue("logEvent", { title: name, at: new Date().toISOString() }).catch((e) => ({ queued: false as const, result: { ok: false as const, error: e instanceof Error ? e.message : "Couldn't log that." } }));
    const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (out.queued) {
      setSaid({ text: `✓ ${name} · ${stamp} · kept here until you're online` });
      return;
    }
    const r = out.result;
    if (!r.ok) {
      setSaid({ text: r.error });
      return;
    }
    const at = stamp;
    const id = r.note?.id;
    setSaid({ text: `✓ ${name} · ${at}`, undo: id ? () => void deleteCheckNoteAction(id).then(() => (setSaid({ text: "Taken back" }), onLogged?.())) : undefined });
    onLogged?.();
  };
  const add = () => {
    const t = draft.trim();
    if (t && names && !names.some((n) => n.toLowerCase() === t.toLowerCase())) save([...names, t]);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {(names ?? []).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => (removing === n ? setRemoving(null) : void log(n))}
            onContextMenu={(e) => (e.preventDefault(), setRemoving(n))}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") hold.current = window.setTimeout(() => setRemoving(n), 520);
            }}
            onPointerUp={() => hold.current && clearTimeout(hold.current)}
            onPointerLeave={() => hold.current && clearTimeout(hold.current)}
            title="Tap to log it now · right-click or hold to remove"
            className="hover-glow due-in flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold"
            style={pill}
          >
            <span aria-hidden className="text-[11px]" style={{ color: "#8a6116" }}>
              ◉
            </span>
            {n}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed #a88a3f", color: "inherit", opacity: 0.85 }}>
            + Add tracked event
          </button>
        )}
        {adding && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") (setDraft(""), setAdding(false));
            }}
            maxLength={60}
            placeholder="Name it, then Enter"
            aria-label="New tracked event"
            className="bare-input h-8 w-44 bg-transparent px-1 text-[15px] focus:outline-none"
            style={{ color: INK, borderBottom: "1px solid #a88a3f" }}
          />
        )}
      </div>
      <Fold open={!!removing}>
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "inherit" }}>
          <span>Stop tracking “{removing}”? (what&apos;s logged stays)</span>
          <button type="button" onClick={() => (names && save(names.filter((x) => x !== removing)), setRemoving(null))} className="h-7 rounded-full px-2.5 font-semibold" style={{ border: "1px solid #9b2c1a", color: "#9b2c1a" }}>
            Remove
          </button>
          <button type="button" onClick={() => setRemoving(null)} className="h-7 rounded-full px-2.5" style={{ color: "inherit", opacity: 0.8 }}>
            Keep
          </button>
        </div>
      </Fold>
      {said && (
        <p role="status" className="confirm-pop m-0 flex items-center gap-2 text-[13px]" style={{ color: "inherit" }}>
          {said.text}
          {said.undo && (
            <button type="button" onClick={() => (said.undo?.(), setSaid(null))} className="font-semibold underline underline-offset-2">
              Undo
            </button>
          )}
          <button type="button" onClick={() => setSaid(null)} aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/5">
            <CloseIcon size={9} />
          </button>
        </p>
      )}
    </div>
  );
}

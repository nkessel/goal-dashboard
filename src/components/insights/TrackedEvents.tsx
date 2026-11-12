"use client";

import { useEffect, useRef, useState } from "react";
import { deleteCheckNoteAction, saveTrackedEventsAction, trackedEventsAction } from "@/app/actions";
import { saveOrQueue } from "@/lib/offline";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { TimeWheels } from "@/components/ui/TimeWheels";

const INK = "#3b2a14";
const pill = { background: "rgba(233,212,154,.55)", border: "1px solid #a88a3f", color: "#2a1c10" } as const;

const LEAF_EVENT = "🍃 Cannabis";

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <g fill="#f3ffe9" stroke="#1f4a1c" strokeWidth=".7" strokeLinejoin="round">
        <path d="M12 2c1.5 3.2 1.6 7.6 0 12.2C10.4 9.600 10.5 5.2 12 2z" />
        <path d="M4.300 6.300c3 1.300 5.600 4 7 8.200-3.700-1.300-6.300-4.200-7-8.200z" />
        <path d="M19.700 6.300c-3 1.300-5.600 4-7 8.200 3.700-1.300 6.300-4.200 7-8.200z" />
        <path d="M2.500 13.400c3-.5 6.200.300 9 2.200-3.300.9-6.600 0-9-2.200z" />
        <path d="M21.500 13.400c-3-.5-6.200.300-9 2.200 3.300.9 6.600 0 9-2.200z" />
      </g>
      <path d="M12 14.500V22" stroke="#f3ffe9" strokeWidth="1.500" strokeLinecap="round" />
    </svg>
  );
}

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
  // The leaf button (owner, Nov 12): logs it at a time picked on wheels, now by default.
  const [leaf, setLeaf] = useState<number | null>(null);
  const log = async (name: string, when?: Date) => {
    // Stamped now, so it keeps its real time when it waits for a connection.
    const out = await saveOrQueue("logEvent", { title: name, at: (when ?? new Date()).toISOString() }).catch((e) => ({ queued: false as const, result: { ok: false as const, error: e instanceof Error ? e.message : "Couldn't log that." } }));
    const stamp = (when ?? new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
        <button
          type="button"
          aria-expanded={leaf !== null}
          aria-label="Log cannabis"
          title="Log cannabis: pick the time, now by default"
          onClick={() => {
            const d = new Date();
            setLeaf((v) => (v === null ? d.getHours() * 60 + d.getMinutes() : null));
          }}
          data-leaf-log
          className="hover-glow flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "radial-gradient(circle at 35% 30%, #8fd17a, #3f8a3a 70%)", border: "1px solid #2c5f28", boxShadow: leaf !== null ? "0 0 0 2px rgba(63,138,58,.35)" : undefined }}
        >
          <LeafIcon />
        </button>
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
      <Fold open={leaf !== null}>
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <TimeWheels value={leaf ?? 0} onChange={setLeaf} />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                const at = new Date();
                const now = at.getHours() * 60 + at.getMinutes();
                const m = leaf ?? now;
                at.setHours(Math.floor(m / 60), m % 60, 0, 0);
                // A time later than now means that time yesterday (nothing is logged in the future).
                if (m > now + 1) at.setDate(at.getDate() - 1);
                setLeaf(null);
                void log(LEAF_EVENT, m === now ? undefined : at);
              }}
              className="h-9 rounded-full px-4 text-[13.5px] font-bold"
              style={{ background: "linear-gradient(180deg,#8fd17a,#4f9a47)", border: "1px solid #2c5f28", color: "#10240e" }}
            >
              Log it
            </button>
            <button type="button" onClick={() => setLeaf(null)} className="h-7 text-[12.5px] underline underline-offset-2" style={{ color: "inherit", opacity: 0.8 }}>
              Cancel
            </button>
          </div>
        </div>
      </Fold>
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

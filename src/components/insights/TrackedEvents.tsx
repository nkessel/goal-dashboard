"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeltInline } from "@/components/ui/FeltAsk";
import { deleteCheckNoteAction, saveTrackedEventsAction, trackedEventsAction } from "@/app/actions";
import { saveOrQueue } from "@/lib/offline";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { TimeWheels } from "@/components/ui/TimeWheels";

const INK = "#3b2a14";
const pill = { background: "rgba(233,212,154,.55)", border: "1px solid #a88a3f", color: "#2a1c10" } as const;

const LEAF_EVENT = "🍃 Cannabis";

/** A seven-fingered leaf, green on parchment (owner, Nov 13: "better drawn, have the leaf be green"). */
function LeafIcon() {
  const blades: [number, number][] = [
    [0, 1],
    [-38, 0.86],
    [38, 0.86],
    [-74, 0.66],
    [74, 0.66],
    [-108, 0.4],
    [108, 0.4],
  ];
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 15.500V22" stroke="#2c6a2a" strokeWidth="1.400" strokeLinecap="round" />
      {blades.map(([deg, k]) => (
        <path key={deg} d="M0 0C-2.300-3.800-1.700-9 0-13.500 1.700-9 2.300-3.800 0 0Z" transform={`translate(12 15.800) rotate(${deg}) scale(${k})`} fill="#3f9a3a" stroke="#1f5a1e" strokeWidth={0.7 / k} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** A time picked on the wheels (minutes after midnight) as a moment: a time later than now means that time yesterday. */
function atFromWheels(m: number): Date | undefined {
  const at = new Date();
  const now = at.getHours() * 60 + at.getMinutes();
  if (m === now) return undefined;
  at.setHours(Math.floor(m / 60), m % 60, 0, 0);
  if (m > now + 1) at.setDate(at.getDate() - 1);
  return at;
}
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Tracked events (owner, Nov 4: anti-habits as "events, but ones that I want to track, with timing recorded"):
 * named pills under the event field; a tap logs one right now (with Undo), "+ Add tracked event" names a new
 * one in place. Right-click or hold a pill for its options (owner, Nov 9): log it at another time on the
 * wheels (earlier today, or last night), or stop tracking it. Kept on the account, so phone and laptop share them.
 */
export function TrackedEvents({ onLogged }: { onLogged?: () => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [said, setSaid] = useState<{ text: string; undo?: () => void } | null>(null);
  // "How do you feel?" under the event just logged (owner, Nov 19).
  const [feltNote, setFeltNote] = useState<string | null>(null);
  const closeFeltNote = useCallback(() => setFeltNote(null), []);
  // The pill whose options are open, and the time on its wheels.
  const [opts, setOpts] = useState<{ name: string; m: number } | null>(null);
  const [sure, setSure] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const hold = useRef<number | null>(null);
  // A hold that opened the options doesn't also log it on release.
  const held = useRef(false);
  const openOpts = (name: string) => {
    setSure(false);
    setJustAdded(false);
    setOpts({ name, m: nowMinutes() });
  };
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
    setSaid({ text: `✓ ${name} · ${at}`, undo: id ? () => void deleteCheckNoteAction(id).then(() => (setSaid({ text: "Taken back" }), setFeltNote(null), onLogged?.())) : undefined });
    onLogged?.();
    if (id) setFeltNote(id);
  };
  const add = () => {
    const t = draft.trim();
    if (t && names && !names.some((n) => n.toLowerCase() === t.toLowerCase())) {
      save([...names, t]);
      setJustAdded(true);
    }
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
            onClick={() => {
              if (held.current) {
                held.current = false;
                return;
              }
              if (opts?.name === n) return setOpts(null);
              setJustAdded(false);
              void log(n);
            }}
            onContextMenu={(e) => (e.preventDefault(), openOpts(n))}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") hold.current = window.setTimeout(() => ((held.current = true), openOpts(n)), 520);
            }}
            onPointerUp={() => hold.current && clearTimeout(hold.current)}
            onPointerLeave={() => hold.current && clearTimeout(hold.current)}
            aria-expanded={opts?.name === n}
            title="Tap to log it now · right-click or hold to log it at another time"
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
          className="hover-glow ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "radial-gradient(circle at 35% 30%, #fffaf0, #f0e4c4 75%)", border: "1px solid #7a9a5a", boxShadow: leaf !== null ? "0 0 0 2px rgba(63,138,58,.4)" : undefined }}
        >
          <LeafIcon />
        </button>
      </div>
      <Fold open={leaf !== null}>
        <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
          <TimeWheels value={leaf ?? 0} onChange={setLeaf} />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                // A time later than now means that time yesterday (nothing is logged in the future).
                const at = atFromWheels(leaf ?? nowMinutes());
                setLeaf(null);
                void log(LEAF_EVENT, at);
              }}
              // The app's forest-green primary, like the quest editor's Save (owner, Nov 19: the bright green was off).
              className="qe-save h-9 rounded-full px-4 text-[14px] font-semibold"
            >
              Log it
            </button>
            <button type="button" onClick={() => setLeaf(null)} className="h-7 text-[13px] underline underline-offset-2" style={{ color: "#6b5631" }}>
              Cancel
            </button>
          </div>
        </div>
      </Fold>
      {/* The added pill's options, said once (owner, Nov 9: "it should show the options"). */}
      <Fold open={justAdded && !opts}>
        <p className="m-0 text-[12.5px]" style={{ color: "inherit", opacity: 0.85 }}>
          Tap it to log it now · hold it (or right-click) to log it at another time, or stop tracking it
        </p>
      </Fold>
      {/* Hold or right-click a pill: log it earlier on the wheels, the leaf's way, or stop tracking it (owner, Nov 9). */}
      <Fold open={!!opts}>
        <div data-tracked-options className="flex flex-col gap-1.5 pt-0.5">
          <span className="text-[13px] font-semibold" style={{ color: "inherit" }}>
            {opts?.name}: when was it?
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <TimeWheels value={opts?.m ?? 0} onChange={(m) => setOpts((o) => (o ? { ...o, m } : o))} />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (!opts) return;
                  const { name, m } = opts;
                  setOpts(null);
                  void log(name, atFromWheels(m));
                }}
                className="qe-save h-9 rounded-full px-4 text-[14px] font-semibold"
              >
                Log it
              </button>
              <button type="button" onClick={() => setOpts(null)} className="h-7 text-[13px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                Cancel
              </button>
            </div>
          </div>
          {sure ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "inherit" }}>
              <span>Stop tracking “{opts?.name}”? (what&apos;s logged stays)</span>
              <button type="button" onClick={() => (names && opts && save(names.filter((x) => x !== opts.name)), setOpts(null))} className="h-7 rounded-full px-2.5 font-semibold" style={{ border: "1px solid #9b2c1a", color: "#9b2c1a" }}>
                Stop tracking
              </button>
              <button type="button" onClick={() => setSure(false)} className="h-7 rounded-full px-2.5" style={{ color: "inherit", opacity: 0.8 }}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setSure(true)} className="self-start text-[12.5px] underline underline-offset-2" style={{ color: "inherit", opacity: 0.8 }}>
              Stop tracking it
            </button>
          )}
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
      {feltNote && <FeltInline key={feltNote} target={{ kind: "note", id: feltNote }} onClose={closeFeltNote} />}
    </div>
  );
}

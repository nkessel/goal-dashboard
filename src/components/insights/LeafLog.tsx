"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteCheckNoteAction, leafPendingAction, leafReasonsAction } from "@/app/actions";
import { saveOrQueue } from "@/lib/offline";
import { FaceRating } from "@/components/ui/FaceRating";
import { Fold } from "@/components/ui/Fold";
import { TimeWheels } from "@/components/ui/TimeWheels";
import { LEAF_EVENT, REASON_MAX, askLine, clock, type LeafInfo } from "@/lib/leaf";
import { FeelingChips, LeafFollowUp, leafChip } from "./LeafFollowUp";

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";

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

export type LeafSaid = { text: string; undo?: () => void; note?: string };

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const minutesLabel = (m: number) => clock(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));

/**
 * The leaf button and its two panels (owner, Nov 24; mockup codes WI-1 C, WR-5 A). Tap: how are you feeling, why are
 * you smoking, Log it. Hold it (touch) or right-click it: the follow-up for the latest log still waiting. Returns the
 * button (for the tracked events' row) and the panels (for under it), so TrackedEvents only places them.
 */
export function useLeafLog({ report, onLogged }: { report: (s: LeafSaid | null) => void; onLogged?: () => void }) {
  const [panel, setPanel] = useState<"log" | "follow" | null>(null);
  // The log panel
  const [face, setFace] = useState<number | null>(null);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [wheels, setWheels] = useState(false);
  // The follow-up panel
  const [waiting, setWaiting] = useState<LeafInfo[] | null>(null);
  const [idx, setIdx] = useState(0);

  const openLog = useCallback(() => {
    setFace(null);
    setFeelings([]);
    setReason("");
    setMinutes(null);
    setWheels(false);
    setPanel("log");
    leafReasonsAction().then(setChips, () => setChips([]));
  }, []);
  const openFollow = useCallback(() => {
    setWaiting(null);
    setIdx(0);
    setPanel("follow");
    leafPendingAction().then(setWaiting, () => setWaiting([]));
  }, []);
  // Sent here from the toucan's "How was it?" (Today).
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("leaf") === "follow") {
        u.searchParams.delete("leaf");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- opens once, from the address
        openFollow();
      }
    } catch {}
  }, [openFollow]);

  const log = async (withReason: boolean) => {
    const now = nowMinutes();
    const m = minutes ?? now;
    const at = new Date();
    if (m !== now) {
      at.setHours(Math.floor(m / 60), m % 60, 0, 0);
      // A time later than now means that time yesterday (nothing is logged in the future).
      if (m > now + 1) at.setDate(at.getDate() - 1);
    }
    const args = { title: LEAF_EVENT, at: at.toISOString(), reason: withReason ? reason.trim().slice(0, REASON_MAX) || null : null, beforeTone: face, beforeFeelings: feelings };
    setPanel(null);
    const out = await saveOrQueue("logEvent", args).catch((e) => ({ queued: false as const, result: { ok: false as const, error: e instanceof Error ? e.message : "Couldn't log that." } }));
    const stamp = clock(at);
    if (out.queued) return report({ text: `✓ ${LEAF_EVENT} · ${stamp} · kept here until you're online` });
    const r = out.result;
    if (!r.ok) return report({ text: r.error });
    const id = r.note?.id;
    report({ text: `✓ ${LEAF_EVENT} · ${stamp}`, undo: id ? () => void deleteCheckNoteAction(id).then(() => (report({ text: "Taken back" }), onLogged?.())) : undefined, note: askLine(at) });
    onLogged?.();
  };

  // Hold on touch, or right-click: the follow-up. A hold must not also fire the tap.
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  const button = (
    <button
      type="button"
      aria-expanded={panel !== null}
      aria-label="Log cannabis"
      title="Tap to log cannabis · hold or right-click for how it went"
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        if (panel === "log") setPanel(null);
        else openLog();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        stopHold();
        held.current = true;
        openFollow();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        held.current = false;
        hold.current = window.setTimeout(() => {
          held.current = true;
          openFollow();
        }, 520);
      }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      data-leaf-log
      className="hover-glow ml-auto flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full [-webkit-touch-callout:none]"
      style={{ background: "radial-gradient(circle at 35% 30%, #fffaf0, #f0e4c4 75%)", border: "1px solid #7a9a5a", boxShadow: panel !== null ? "0 0 0 2px rgba(63,138,58,.4)" : undefined }}
    >
      <LeafIcon />
    </button>
  );

  const nowM = nowMinutes();
  const current = waiting?.[idx];
  const panels = (
    <>
      <Fold open={panel === "log"}>
        <div className="flex flex-col gap-2.5 pt-0.5" data-leaf-panel>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold" style={{ color: INK }}>
              How are you feeling?
            </span>
            <FaceRating value={face} onChange={setFace} label="How are you feeling?" compact />
            <FeelingChips value={feelings} onChange={setFeelings} label="Feeling words, before" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold" style={{ color: INK }}>
              Why are you smoking?
            </span>
            {chips.length > 0 && (
              <div role="group" aria-label="Your usual reasons" className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button key={c} type="button" aria-pressed={reason.trim().toLowerCase() === c.toLowerCase()} onClick={() => setReason(c)} className="h-8 max-w-full truncate rounded-full px-3 text-[13px] font-semibold" style={leafChip(reason.trim().toLowerCase() === c.toLowerCase())}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void log(true)}
              maxLength={REASON_MAX}
              placeholder="A few words"
              aria-label="Why are you smoking?"
              className="event-input h-9 rounded-xl px-2.5 text-[15px]"
              style={{ color: INK }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => void log(true)} className="qe-save h-9 rounded-full px-4 text-[14px] font-semibold">
              Log it
            </button>
            <button
              type="button"
              aria-expanded={wheels}
              aria-label="When"
              onClick={() => {
                if (!wheels && minutes === null) setMinutes(nowMinutes());
                setWheels((v) => !v);
              }}
              className="h-8 rounded-full px-3 text-[13px] font-semibold"
              style={leafChip(wheels)}
            >
              {minutes === null || minutes === nowM ? "Now" : minutesLabel(minutes)} ▾
            </button>
            <button type="button" onClick={() => setPanel(null)} className="h-7 text-[13px] underline underline-offset-2" style={{ color: INK_SOFT }}>
              Cancel
            </button>
          </div>
          <Fold open={wheels}>
            <div className="pt-0.5">
              <TimeWheels value={minutes ?? nowM} onChange={setMinutes} />
            </div>
          </Fold>
          <button type="button" onClick={() => void log(false)} className="self-start text-[12.5px] underline underline-offset-2" style={{ color: INK_SOFT }}>
            Log without a reason
          </button>
        </div>
      </Fold>
      <Fold open={panel === "follow"}>
        <div className="pt-0.5" data-leaf-follow-panel>
          {waiting === null ? (
            <p className="m-0 text-[13px]" style={{ color: INK_SOFT }}>
              Looking for one…
            </p>
          ) : !current ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="m-0 text-[14px]" style={{ color: INK }}>
                Nothing waiting for a follow-up.
              </p>
              <button type="button" onClick={openLog} className="qe-save h-9 rounded-full px-4 text-[14px] font-semibold">
                Log one now
              </button>
            </div>
          ) : (
            <LeafFollowUp
              key={current.id}
              item={current}
              onClose={() => setPanel(null)}
              onSaved={() => {
                setPanel(null);
                report({ text: "✓ Saved how it went" });
                onLogged?.();
              }}
              extra={
                idx + 1 < (waiting?.length ?? 0) ? (
                  <button type="button" onClick={() => setIdx((i) => i + 1)} className="h-7 text-[13px] underline underline-offset-2" style={{ color: INK_SOFT }}>
                    Earlier one?
                  </button>
                ) : null
              }
            />
          )}
        </div>
      </Fold>
    </>
  );
  return { button, panels };
}

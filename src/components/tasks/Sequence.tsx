"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { findQuestsAction, sequenceDetachAction, sequenceLinkAction, sequenceMoveAction, sequenceOfAction } from "@/app/actions";
import { useEscape } from "@/lib/use-escape";
import type { SequenceItem } from "@/lib/data/sequences";

type Waiting = { id: string; title: string; estimate_minutes: number | null };

const mins = (m: number | null) => (m ? (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`) : null);

/**
 * The quests waiting behind a quest: blank card outlines peeking out under it,
 * one per quest (up to three drawn), with a small tab to peek at what's next.
 */
export function SequenceStack({ queue, isAdventure, onEdit }: { queue: Waiting[]; isAdventure: boolean; onEdit: () => void }) {
  const [peekAt, setPeekAt] = useState<HTMLElement | null>(null);
  const peek = !!peekAt;
  const layers = Math.min(3, queue.length);
  const edge = isAdventure ? "#b39a6a" : "var(--t-card-border)";
  return (
    <>
      {Array.from({ length: layers }, (_, n) => layers - 1 - n).map((i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded-2xl"
          style={{
            zIndex: 0,
            left: 10 + i * 9,
            right: 10 + i * 9,
            top: 16,
            bottom: stackPad(queue.length) - (i + 1) * 6,
            border: `1.5px solid ${edge}`,
            background: isAdventure ? `rgba(240,226,196,${0.92 - i * 0.18})` : "var(--t-card)",
            opacity: 1 - i * 0.18,
            boxShadow: "0 2px 5px rgba(0,0,0,.18)",
          }}
        />
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const el = e.currentTarget;
          setPeekAt((v) => (v ? null : el));
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`${queue.length} more ${queue.length === 1 ? "quest" : "quests"} in this sequence — peek`}
        aria-expanded={peek}
        className="seq-tab absolute left-1/2 z-[2] flex h-6 -translate-x-1/2 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold"
        style={{
          bottom: 0,
          background: isAdventure ? "linear-gradient(180deg,#f4e7c6,#e3cd9b)" : "var(--t-card)",
          border: `1.5px solid ${edge}`,
          color: "var(--t-ink-soft)",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }}
      >
        <StackMini /> {queue.length} after this
      </button>
      {peek && (
        <SequencePeek
          anchor={peekAt}
          queue={queue}
          isAdventure={isAdventure}
          onClose={() => setPeekAt(null)}
          onEdit={() => {
            setPeekAt(null);
            onEdit();
          }}
        />
      )}
    </>
  );
}

/** Room under a card for its stack and the peek tab. */
export const stackPad = (n: number) => (n ? Math.min(3, n) * 6 + 12 : 0);

function StackMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="9" width="16" height="11" rx="2.2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M6.5 6h11M9 3h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** A small card showing what comes next (the next one clearly, the rest faintly). */
function SequencePeek({ anchor, queue, isAdventure, onClose, onEdit }: { anchor: HTMLElement | null; queue: Waiting[]; isAdventure: boolean; onClose: () => void; onEdit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 16);
      const h = ref.current?.offsetHeight ?? 160;
      setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8)) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);
  useEscape(onClose);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target as Element;
      if (ref.current?.contains(el) || anchor?.contains(el) || el.closest?.("[data-feedback-root]")) return;
      onClose();
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", down, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [anchor, onClose]);
  const [next, ...rest] = queue;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Coming up in this sequence"
      onClick={(e) => e.stopPropagation()}
      className={`card-pop-in fixed z-[70] flex flex-col gap-2 rounded-xl p-3 shadow-2xl ${isAdventure ? "parchment" : ""}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(300, typeof window === "undefined" ? 300 : window.innerWidth - 16), background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)", border: `1.5px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, color: "var(--t-ink)" }}
    >
      <p className="relative z-[1] m-0 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
        Unlocks when this one is done
      </p>
      {next && (
        <div className="relative z-[1] flex items-baseline gap-2">
          <span className="text-[15px] font-semibold leading-snug">{next.title}</span>
          {mins(next.estimate_minutes) && (
            <span className="shrink-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              {mins(next.estimate_minutes)}
            </span>
          )}
        </div>
      )}
      {rest.length > 0 && (
        <ol className="relative z-[1] m-0 flex list-none flex-col gap-0.5 p-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {rest.slice(0, 5).map((q, i) => (
            <li key={q.id} className="truncate">
              then {i + 2}. {q.title}
            </li>
          ))}
          {rest.length > 5 && <li>and {rest.length - 5} more</li>}
        </ol>
      )}
      <button type="button" onClick={onEdit} className="relative z-[1] self-end rounded-full px-3 py-1 text-[13px] font-semibold hover:bg-black/5" style={{ border: "1.5px solid #b39a6a" }}>
        Edit the sequence…
      </button>
    </div>,
    document.body
  );
}

type Found = { id: string; title: string };

/**
 * Search your open quests, or name a new one. Used to add a quest before or
 * after another.
 */
export function QuestPicker({ exclude, onPick, autoFocus = false, placeholder = "Search your quests, or name a new one" }: { exclude: string[]; onPick: (p: { id: string; title: string } | { title: string }) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [hi, setHi] = useState(0);
  const excludeKey = exclude.join(",");
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      findQuestsAction(q, excludeKey ? excludeKey.split(",") : []).then((r) => live && (setFound(r), setHi(0)), () => {});
    }, q ? 180 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, excludeKey]);
  const term = q.trim();
  const exact = found.some((f) => f.title.trim().toLowerCase() === term.toLowerCase());
  const options: ({ id: string; title: string } | { title: string; isNew: true })[] = [...found.slice(0, 7), ...(term && !exact ? [{ title: term, isNew: true as const }] : [])];
  const choose = (o: (typeof options)[number]) => {
    onPick("isNew" in o ? { title: o.title } : { id: o.id, title: o.title });
    setQ("");
  };
  return (
    <div className="flex flex-col gap-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(options.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && options[hi] && !(e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            choose(options[hi]);
          }
        }}
        className="h-10 w-full rounded-lg border bg-transparent px-3 text-[15px]"
        style={{ borderColor: "#b39a6a", color: "var(--t-ink)" }}
      />
      {options.length > 0 && (
        <ul role="listbox" className="m-0 flex max-h-56 list-none flex-col overflow-y-auto rounded-lg p-0" style={{ border: "1px solid rgba(140,110,60,.3)" }}>
          {options.map((o, i) => (
            <li key={"isNew" in o ? "new" : o.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === hi}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(o)}
                className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-[14.5px]"
                style={{ background: i === hi ? "rgba(140,110,60,.14)" : undefined }}
              >
                {"isNew" in o ? (
                  <>
                    <span aria-hidden className="font-bold" style={{ color: "var(--t-accent)" }}>
                      +
                    </span>
                    <span>
                      New quest: <b>{o.title}</b>
                    </span>
                  </>
                ) : (
                  <span className="truncate">{o.title}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The whole sequence a quest belongs to, front to back: move quests up and
 * down, take them out, and add quests before or after this one.
 */
export function SequenceDialog({ taskId, title, isAdventure, onClose }: { taskId: string; title: string; isAdventure: boolean; onClose: () => void }) {
  const router = useRouter();
  const [chain, setChain] = useState<SequenceItem[] | null>(null);
  const [where, setWhere] = useState<"before" | "after">("after");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEscape(onClose);
  useEffect(() => {
    sequenceOfAction(taskId).then(setChain, () => setError("Couldn't load the sequence."));
  }, [taskId]);
  const run = (fn: () => Promise<SequenceItem[]>) =>
    start(async () => {
      setError(null);
      try {
        setChain(await fn());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change that.");
      }
    });
  const open = (chain ?? []).filter((c) => c.status === "open");
  const ink = "var(--t-ink-soft)";
  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[72] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quest sequence"
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed relative flex max-h-[88vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-5"
        style={{ color: "var(--t-ink)", background: isAdventure ? undefined : "var(--t-card)" }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-[2] flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/5" style={{ color: ink }}>
          ×
        </button>
        <div className="relative z-[1] flex flex-col gap-0.5 pr-8">
          <p className={`m-0 text-[19px] ${isAdventure ? "font-display" : "font-bold"}`}>Sequence</p>
          <p className="m-0 text-[13.5px]" style={{ color: ink }}>
            One quest at a time: each waits, stacked out of sight, until the one before it is done.
          </p>
        </div>

        <ol className="relative z-[1] m-0 flex list-none flex-col gap-1.5 p-0">
          {chain === null && !error && <li className="text-[14px] italic" style={{ color: ink }}>Gathering the quests…</li>}
          {(chain ?? []).map((c) => {
            const me = c.id === taskId;
            const done = c.status !== "open";
            const at = open.findIndex((o) => o.id === c.id);
            return (
              <li
                key={c.id}
                className="flex min-h-11 items-center gap-2 rounded-xl px-2.5"
                style={{
                  border: `1.5px solid ${me ? "var(--t-gold, #c9a14a)" : "rgba(140,110,60,.35)"}`,
                  background: me ? "rgba(242,213,138,.25)" : undefined,
                  opacity: done ? 0.6 : 1,
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ border: "1.5px solid #b39a6a", color: ink }}>
                  {done ? "✓" : at + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[14.5px] ${me ? "font-semibold" : ""} ${done ? "line-through" : ""}`}>{c.title}</span>
                {!done && !c.reward && (
                  <span className="flex shrink-0 items-center">
                    <IconBtn label="Earlier" disabled={busy || at <= 0} onClick={() => run(() => sequenceMoveAction(c.id, -1, taskId))}>
                      ↑
                    </IconBtn>
                    <IconBtn label="Later" disabled={busy || at < 0 || at >= open.length - 1} onClick={() => run(() => sequenceMoveAction(c.id, 1, taskId))}>
                      ↓
                    </IconBtn>
                    {open.length > 1 && (
                      <IconBtn label={me ? "Take this quest out of the sequence" : "Take out of the sequence"} disabled={busy} onClick={() => run(() => sequenceDetachAction(c.id, taskId))}>
                        ×
                      </IconBtn>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="relative z-[1] flex flex-col gap-2 rounded-xl p-3" style={{ border: "1px dashed rgba(140,110,60,.5)" }}>
          <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
            <span>Add a quest</span>
            {(["before", "after"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={where === w}
                onClick={() => setWhere(w)}
                className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
                style={where === w ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10" } : { border: "1.5px solid #b39a6a" }}
              >
                {w}
              </button>
            ))}
            <span className="min-w-0 truncate italic" style={{ color: ink }}>
              “{title}”
            </span>
          </div>
          <QuestPicker exclude={(chain ?? []).map((c) => c.id)} onPick={(p) => run(() => sequenceLinkAction(taskId, where, "id" in p ? { id: p.id } : { title: p.title }))} />
        </div>
        {error && (
          <p role="alert" className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <div className="relative z-[1] flex justify-end">
          <button type="button" onClick={onClose} className="hover-glow h-10 rounded-full px-5 text-[15px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] hover:bg-black/5 disabled:opacity-30">
      {children}
    </button>
  );
}

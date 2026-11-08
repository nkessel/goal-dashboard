"use client";

import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { findQuestsAction, listQuestStepsAction, questForEditAction, sequenceDetachAction, sequenceLinkAction, sequenceOfAction, sequenceReorderAction, stepsToSequenceAction } from "@/app/actions";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEscape } from "@/lib/use-escape";
import type { SequenceItem } from "@/lib/data/sequences";
import { useClosing } from "@/components/ui/Fold";
import type { Task } from "@/lib/data/types";
import { CloseIcon } from "@/components/ui/Icons";

// Loaded on demand (the editor imports this file too).
const EditTaskModal = lazy(() => import("./EditTaskModal").then((m) => ({ default: m.EditTaskModal })));

type Waiting = { id: string; title: string; estimate_minutes: number | null };

const mins = (m: number | null) => (m ? (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`) : null);

/**
 * The quests waiting behind a quest: blank card outlines peeking out above it (owner, Nov 3),
 * one per quest (up to three drawn); "N after this" shows on hover (or focus) to peek at what's next.
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
            top: stackPad(queue.length) - (i + 1) * 6,
            bottom: 16,
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
        className="seq-tab absolute left-1/2 z-[3] flex h-6 -translate-x-1/2 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold"
        data-open={peek ? "true" : undefined}
        style={{
          top: -6,
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
export const stackPad = (n: number) => (n ? Math.min(3, n) * 6 + 2 : 0);

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
  // Suggestions wait until the field is touched, so the list never appears under a tap meant for the field.
  const [touched, setTouched] = useState(autoFocus);
  const excludeKey = exclude.join(",");
  useEffect(() => {
    if (!touched) return;
    let live = true;
    const t = setTimeout(() => {
      findQuestsAction(q, excludeKey ? excludeKey.split(",") : []).then((r) => live && (setFound(r), setHi(0)), () => {});
    }, q ? 180 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, excludeKey, touched]);
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
        onChange={(e) => (setQ(e.target.value), setTouched(true))}
        onFocus={() => setTouched(true)}
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
 * down, take them out, add quests before or after this one, or turn the
 * quest's steps into a sequence of quests (a project).
 */
export function SequenceDialog({ taskId, title, isAdventure, onClose: closeNow, onStepsMoved, onEditSelf }: { taskId: string; title: string; isAdventure: boolean; onClose: () => void; onStepsMoved?: () => void; /** Tapping this quest's own row (e.g. close and go back to its editor). */ onEditSelf?: () => void }) {
  const router = useRouter();
  // Changes show on the page once the window closes: refreshing while it's open took away the card
  // (and the editor) it was opened from, so the window vanished mid-edit (owner, Nov 4).
  const changed = useRef(false);
  const { closing, close: onClose } = useClosing(() => {
    if (changed.current) router.refresh();
    closeNow();
  });
  const [chain, setChain] = useState<SequenceItem[] | null>(null);
  const [where, setWhere] = useState<"before" | "after">("after");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEscape(onClose);
  // Open top-level steps that could each become a quest of their own.
  const [openSteps, setOpenSteps] = useState(0);
  const [confirmSteps, setConfirmSteps] = useState(false);
  useEffect(() => {
    sequenceOfAction(taskId).then(setChain, () => setError("Couldn't load the sequence."));
    listQuestStepsAction(taskId).then((rows) => setOpenSteps((rows ?? []).filter((r) => !r.parent_id && !r.done && !r.state).length), () => {});
  }, [taskId]);
  const run = (fn: () => Promise<SequenceItem[]>) =>
    start(async () => {
      setError(null);
      try {
        setChain(await fn());
        changed.current = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change that.");
      }
    });
  const open = (chain ?? []).filter((c) => c.status === "open");
  const movable = open.filter((c) => !c.reward);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const ink = "var(--t-ink-soft)";
  const [minimized, setMinimized] = useState(false);
  // A quest in the sequence opened in its own editor (owner: "make quests in a sequence easy to edit").
  const [editing, setEditing] = useState<Task | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const edit = (id: string) => {
    if (id === taskId && onEditSelf) return onEditSelf();
    setOpening(id);
    questForEditAction(id).then(
      (t) => (setOpening(null), t ? setEditing(t) : setError("That quest isn't there any more.")),
      () => (setOpening(null), setError("Couldn't open that quest."))
    );
  };
  if (editing)
    return (
      <Suspense fallback={null}>
        <EditTaskModal
          task={editing}
          theme={isAdventure ? "adventure" : "calm"}
          onClose={() => {
            setEditing(null);
            sequenceOfAction(taskId).then(setChain, () => {});
            router.refresh();
          }}
        />
      </Suspense>
    );
  // A window you can move (drag its title), resize (its corner) and minimize to a chip (owner, Nov 3).
  return (
    <FloatingWindow storageKey="sequence-window-at" width={448} z={72} minimized={minimized} onRestore={() => setMinimized(false)} label="Open the sequence (drag to move)" at={() => ({ x: Math.max(8, (window.innerWidth - 448) / 2), y: Math.min(96, window.innerHeight * 0.12) })} chip={<>🧩 Sequence</>}>
      <div
        role="dialog"
        aria-label="Quest sequence"
        onClick={(e) => e.stopPropagation()}
        className={`${closing ? "overlay-fade-out pointer-events-none" : "card-pop-in"} parchment parchment-framed relative flex min-h-[220px] min-w-[280px] w-full max-h-[calc(100dvh-110px)] flex-col gap-3 overflow-y-auto rounded-2xl p-5`}
        style={{ color: "var(--t-ink)", background: isAdventure ? undefined : "var(--t-card)", resize: "both", boxShadow: "0 18px 44px rgba(0,0,0,.45)" }}
      >
        <span className="absolute right-3 top-3 z-[2] flex items-center gap-0.5">
          <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize" title="Minimize to a button you can move" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/5" style={{ color: ink }}>
            –
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/5" style={{ color: ink }}>
            <CloseIcon size={11} />
          </button>
        </span>
        <div data-drag-handle className="relative z-[1] flex cursor-grab touch-none select-none flex-col gap-0.5 pr-16 active:cursor-grabbing" title="Drag to move">
          <p className={`m-0 text-[19px] ${isAdventure ? "font-display" : "font-bold"}`}>{chain && chain.length > 1 ? "Sequence" : "Create a sequence"}</p>
          <p className="m-0 text-[13.5px]" style={{ color: ink }}>
            One quest at a time, top to bottom. Drag a card to reorder; tap it to edit.
          </p>
        </div>

        {/* The quests as cards, in order (owner, Nov 4): drag a card to reorder, tap it to edit. */}
        <div className="relative z-[1] flex flex-col gap-1.5">
          {chain === null && !error && <p className="m-0 text-[14px] italic" style={{ color: ink }}>Gathering the quests…</p>}
          {(chain ?? [])
            .filter((c) => c.status !== "open")
            .map((c) => (
              <SeqCard key={c.id} c={c} me={c.id === taskId} done onEdit={() => edit(c.id)} opening={opening === c.id} />
            ))}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const ids = movable.map((c) => c.id);
              const from = ids.indexOf(String(e.active.id));
              const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
              if (from < 0 || to < 0 || from === to) return;
              const next = arrayMove(ids, from, to);
              // Show the new order at once; the server confirms it.
              setChain((cur) => (cur ? [...cur.filter((c) => c.status !== "open" || c.reward), ...next.map((id) => cur.find((c) => c.id === id)!)] : cur));
              run(() => sequenceReorderAction(next, taskId));
            }}
          >
            <SortableContext items={movable.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {movable.map((c, i) => (
                <SortableSeqCard key={c.id} c={c} n={i + 1} me={c.id === taskId} onEdit={() => (c.id === taskId && !onEditSelf ? undefined : edit(c.id))} opening={opening === c.id} onTakeOut={movable.length > 1 ? () => run(() => sequenceDetachAction(c.id, taskId)) : undefined} busy={busy} />
              ))}
            </SortableContext>
          </DndContext>
          {(chain ?? []).filter((c) => c.status === "open" && c.reward).map((c) => (
            <SeqCard key={c.id} c={c} me={false} done={false} onEdit={() => {}} opening={false} />
          ))}
        </div>

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
        {/* A project: its steps become quests of their own, one after another, with this quest last. */}
        {openSteps > 0 && (
          <div className="relative z-[1] flex flex-col gap-1.5 rounded-xl p-3" style={{ border: "1px dashed rgba(140,110,60,.5)" }}>
            {!confirmSteps ? (
              <button type="button" disabled={busy} onClick={() => setConfirmSteps(true)} className="flex min-h-9 items-center gap-2 text-left text-[14px] font-semibold disabled:opacity-50">
                <StackMini />
                Turn its {openSteps} {openSteps === 1 ? "sub-quest" : "sub-quests"} into a sequence of quests
              </button>
            ) : (
              <>
                <p className="m-0 text-[13.5px]">
                  Each open step becomes its own quest, in order, ahead of “{title}”. This quest comes last and closes the project out.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const next = await stepsToSequenceAction(taskId);
                        setOpenSteps(0);
                        setConfirmSteps(false);
                        onStepsMoved?.();
                        return next;
                      })
                    }
                    className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50"
                    style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10" }}
                  >
                    Make the sequence
                  </button>
                  <button type="button" onClick={() => setConfirmSteps(false)} className="h-9 px-2 text-[13.5px] underline" style={{ color: ink }}>
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <div className="relative z-[1] flex justify-end">
          <button type="button" onClick={onClose} className="hover-glow h-10 rounded-full px-5 text-[15px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Close
          </button>
        </div>
      </div>
    </FloatingWindow>
  );
}

const SEQ_CARD = { background: "linear-gradient(180deg,#f8eed6,#ecdcb4)", border: "1.5px solid #b39a6a", boxShadow: "0 2px 5px rgba(60,40,10,.18), inset 0 1px 0 rgba(255,255,255,.5)" } as const;

/** A quest in the sequence, drawn like a small quest card: portrait, title, time and XP. */
function SeqCardBody({ c, n, me, done }: { c: SequenceItem; n?: number; me: boolean; done: boolean }) {
  return (
    <>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #a58c66", boxShadow: "0 0 0 2px rgba(217,180,95,.45)", background: "radial-gradient(circle at 40% 35%, #fbf3dc, #ecdcb4)" }}>
        {c.icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- quest portrait
          <img src={c.icon} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[14px] font-bold" style={{ color: "#6b5631" }}>{done ? "✓" : c.reward ? "🎁" : n}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`line-clamp-2 text-[15px] leading-snug ${me ? "font-bold" : "font-semibold"}`} style={{ color: "#3d2f18" }}>
          {c.title}
        </span>
        <span className="text-[12px]" style={{ color: "#6b5631" }}>
          {done ? "Done" : c.reward ? "Reward at the end" : me ? "This quest" : n === 1 ? "Up first" : `Then, ${ordinal(n ?? 0)}`}
          {!done && c.minutes ? ` · ${mins(c.minutes)}` : ""}
        </span>
      </span>
      {!!c.xp && !c.reward && (
        <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "#4f6d3c" }}>
          {c.xp} XP
        </span>
      )}
    </>
  );
}

function ordinal(n: number) {
  return ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][n] ?? `#${n}`;
}

function SeqCard({ c, me, done, onEdit, opening }: { c: SequenceItem; me: boolean; done: boolean; onEdit: () => void; opening: boolean }) {
  return (
    <button type="button" onClick={onEdit} disabled={opening || c.reward} className="flex min-h-14 w-full items-center gap-2.5 rounded-2xl px-2.5 py-1.5 text-left" style={{ ...SEQ_CARD, opacity: done ? 0.6 : 1 }}>
      <SeqCardBody c={c} me={me} done={done} />
    </button>
  );
}

function SortableSeqCard({ c, n, me, onEdit, opening, onTakeOut, busy }: { c: SequenceItem; n: number; me: boolean; onEdit: () => void; opening: boolean; onTakeOut?: () => void; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onEdit}
      title={`Drag to reorder · tap to edit “${c.title}”`}
      className={`flex min-h-14 touch-manipulation items-center gap-2.5 rounded-2xl px-2.5 py-1.5 ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${opening ? "opacity-60" : ""}`}
      style={{ ...SEQ_CARD, ...(me ? { border: "1.5px solid #c99a3a", boxShadow: "0 0 0 2px rgba(217,180,95,.35), 0 2px 5px rgba(60,40,10,.18)" } : {}), transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: "relative", ...(isDragging ? { boxShadow: "0 10px 22px rgba(0,0,0,.25)" } : {}) }}
    >
      <SeqCardBody c={c} n={n} me={me} done={false} />
      {onTakeOut && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => (e.stopPropagation(), onTakeOut())}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Take “${c.title}” out of the sequence`}
          title="Take out of the sequence"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full leading-none hover:bg-black/[.06] disabled:opacity-40"
          style={{ color: "#6b5631" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

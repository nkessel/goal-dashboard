"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addTaskSessionAction, createQuestAction, reopenTaskAction, unscheduleTaskAction } from "@/app/actions";
import { FailQuest } from "@/components/tasks/FailQuest";
import { completeQuestNow } from "@/lib/complete-quest-now";
import { clearQuestNow, markReopenedNow, questSig, useQuestNow } from "@/lib/failed-now";
import { CloseIcon, GearIcon } from "@/components/ui/Icons";
import { arrangeCalMenu, readCalMenuLayout, serverCalMenuLayout, subscribeCalMenuLayout, type CalMenuKind } from "@/lib/cal-menu-layout";
import { CalMenuArrange } from "./CalMenuArrange";
import { SlotPickerDialog } from "@/components/tasks/SlotPickerDialog";
import { sessionRef } from "@/lib/calendar-task-window";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import type { Task } from "@/lib/data/types";
import { fromFeedback } from "@/lib/from-feedback";
import { CardLookPicker } from "./CardLookPicker";
import { DrivePicks } from "@/components/tasks/DrivePicks";
import { saveQuestPlace, useQuestPlace } from "@/lib/use-quest-places";


export type MenuTarget = { kind: "task"; task: Task; start: Date; end: Date } | { kind: "event"; id: string; title: string; start: Date; end: Date };

/**
 * Right-click (or long-press) on a calendar item: open or unschedule a quest;
 * edit an event or turn it into a quest; and schedule a follow-up quest
 * straight after any quest, event or meeting.
 */
export function CalendarItemMenu({ target, x, y, theme, onClose }: { target: MenuTarget; x: number; y: number; theme: "calm" | "adventure"; onClose: () => void }) {
  const router = useRouter();
  // Completed, failed or reopened a moment ago on this page: the menu offers what fits the card as it looks now.
  const shown = useQuestNow(target.kind === "task" ? target.task : undefined);
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"menu" | "followup" | "look" | "place" | "fail">("menu");
  const place = useQuestPlace(target.kind === "task" ? target.task.id : undefined);
  const [minutes, setMinutes] = useState(15);
  const [title, setTitle] = useState(`Follow up: ${target.kind === "task" ? target.task.title : target.title}`.slice(0, 120));
  const [editing, setEditing] = useState<Task | null>(null);
  /** Picking a time for another session of this quest (owner, Nov 5: one quest in several calendar spots). */
  const [another, setAnother] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [arranging, setArranging] = useState(false);
  const layout = useSyncExternalStore(
    subscribeCalMenuLayout,
    () => readCalMenuLayout(target.kind),
    () => serverCalMenuLayout(target.kind)
  );

  useEffect(() => {
    const down = (e: PointerEvent) => !fromFeedback(e) && ref.current && !ref.current.contains(e.target as Node) && !editing && !another && onClose();
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && !editing && !another && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, editing, another]);

  function addFollowUp() {
    setError(null);
    const start = target.end;
    const end = new Date(start.getTime() + minutes * 60_000);
    startTransition(async () => {
      try {
        await createQuestAction({
          title,
          description: target.kind === "event" ? `After “${target.title}”` : `After “${target.task.title}”`,
          importance: 3,
          urgency: 3,
          xpValue: Math.max(5, Math.round(minutes / 3) * 2),
          estimateMinutes: minutes,
          iconKey: "/design/icon-followup.svg",
          iconSource: "library",
          placement: "none",
          schedule: { startISO: start.toISOString(), endISO: end.toISOString() },
        });
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add the follow-up.");
      }
    });
  }

  const W = mode === "place" ? 300 : 250;
  const left = typeof window === "undefined" ? x : Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = typeof window === "undefined" ? y : Math.max(8, Math.min(y, window.innerHeight - (mode === "menu" ? 330 : 300)));
  const item = "relative z-[1] min-h-10 px-3.5 text-left text-[14.5px] hover:bg-black/[.06]";

  if (editing) return <EditTaskModal task={editing} theme={theme} onClose={() => (setEditing(null), onClose())} />;
  if (another && target.kind === "task") {
    const len = Math.round((target.end.getTime() - target.start.getTime()) / 60_000);
    const next = new Date(target.start);
    next.setDate(next.getDate() + 1);
    return (
      <SlotPickerDialog
        heading="Another session"
        questTitle={target.task.title}
        durationMinutes={Math.max(15, Math.min(240, len || 60))}
        initial={next.toISOString()}
        isAdventure={theme === "adventure"}
        placing={pending}
        onPick={(slot) =>
          startTransition(async () => {
            try {
              await addTaskSessionAction(sessionRef(target.task), slot.start, slot.end);
              router.refresh();
              onClose();
            } catch (e) {
              setAnother(false);
              setError(e instanceof Error ? e.message : "Couldn't add the session.");
            }
          })
        }
        onClose={() => (setAnother(false), onClose())}
      />
    );
  }
  const menuKind: CalMenuKind = target.kind;
  const t = target.kind === "task" ? target.task : null;
  const gcal = (action: string) => () => (target.kind === "event" && window.dispatchEvent(new CustomEvent("gcal-item", { detail: { id: target.id, action } })), onClose());
  type Row = { key: string; label: string; onClick: () => void; danger?: "red" | "line"; busy?: boolean };
  const all: (Row | null)[] = t
    ? [
        { key: "open", label: "Edit quest", onClick: () => setEditing(t) },
        shown?.status !== "completed"
          ? {
              key: "complete",
              label: "Complete quest",
              busy: true,
              // The check lands on the card at once; the menu closes and the celebration follows.
              onClick: () => (void completeQuestNow(t, () => router.refresh()), onClose()),
            }
          : null,
        {
          key: "unschedule",
          label: t.session_id ? "Remove this session" : "Remove from calendar",
          busy: true,
          onClick: () =>
            startTransition(async () => {
              await unscheduleTaskAction(sessionRef(t)).catch(() => {});
              router.refresh();
              onClose();
            }),
        },
        { key: "another", label: "+ Additional time block for this quest", onClick: () => setAnother(true) },
        { key: "place", label: place ? place : "Add location or travel time", onClick: () => setMode("place") },
        { key: "followup", label: "Schedule follow-up quest", danger: "line", onClick: () => setMode("followup") },
        // Failing a quest, or taking a failure back (owner, Nov 13).
        shown?.status !== "completed"
          ? { key: "fail", label: "✕ Quest failure", danger: "red", onClick: () => setMode("fail") }
          : shown.failed_at
            ? {
                key: "fail",
                label: "Undo quest failure",
                danger: "line",
                busy: true,
                onClick: async () => {
                  // Shown open at once and the menu closes; back to failed if the server says no.
                  markReopenedNow(t.id, questSig(t));
                  onClose();
                  const ok = await reopenTaskAction(t.id).then(() => true, () => false);
                  if (!ok) clearQuestNow(t.id);
                  router.refresh();
                },
              }
            : null,
      ]
    : [
        { key: "edit", label: "Edit", onClick: gcal("edit") },
        { key: "quest", label: theme === "adventure" ? "Turn into a quest" : "Turn into a task", onClick: gcal("quest") },
        { key: "followup", label: "Schedule follow-up quest", danger: "line", onClick: () => setMode("followup") },
        // An event's menu ends with Delete by default (owner, Nov 16 and Nov 18): its own just-this-day / every-repeat question.
        { key: "delete", label: "Delete…", danger: "red", onClick: gcal("delete") },
      ];
  const rows = all.filter((r): r is Row => r !== null).map((r) => (layout.labels?.[r.key] ? { ...r, label: layout.labels[r.key] } : r));

  return createPortal(
    <div ref={ref} role="menu" data-menu="calendar-item" className="parchment fixed z-[131] flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
      {mode === "menu" ? (
        <>
          <button type="button" aria-label="Close menu" onClick={onClose} className="absolute right-1 top-1 z-[2] flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={12} />
          </button>
          {/* The gear arranges this menu in place (owner, Nov 16 f562c138): drag rows, eye on the right to hide, tap a name to rename. */}
          <button
            type="button"
            onClick={() => setArranging((v) => !v)}
            aria-pressed={arranging}
            aria-label={arranging ? "Done arranging this menu" : "Arrange this menu: order and which items show"}
            title={arranging ? "Done arranging" : "Arrange this menu"}
            className="absolute right-8 top-1 z-[2] flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
            style={{ color: "var(--t-ink-soft)", background: arranging ? "rgba(217,180,95,.3)" : undefined }}
          >
            {arranging ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#5c7a2e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <GearIcon size={14} />
            )}
          </button>
          {arranging ? (
            <CalMenuArrange kind={menuKind} rows={rows} layout={layout} />
          ) : (
            arrangeCalMenu(rows, layout).map((r, i) => (
              <button
                key={r.key}
                type="button"
                role="menuitem"
                data-mi={r.key}
                className={`${item} ${r.key === "place" ? "truncate" : ""} ${r.danger && i > 0 ? "border-t" : ""}`}
                style={{ color: r.danger === "red" ? "#8a2a1c" : "var(--t-ink)", borderColor: "rgba(139,112,64,.25)", paddingRight: i === 0 ? 64 : undefined }}
                disabled={r.busy && pending}
                onClick={r.onClick}
              >
                {r.label}
              </button>
            ))
          )}
          {error && (
            <p className="relative z-[1] m-0 px-3.5 pb-1 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </>
      ) : mode === "fail" && target.kind === "task" ? (
        <FailQuest task={target.task} onBack={() => setMode("menu")} onDone={() => (router.refresh(), onClose())} />
      ) : mode === "look" && target.kind === "task" ? (
        <div className="relative z-[1] px-3 py-2">
          <CardLookPicker task={target.task} />
        </div>
      ) : mode === "place" && target.kind === "task" ? (
        <div className="relative z-[1] flex flex-col gap-2 px-3 py-2">
          <input
            autoFocus
            defaultValue={place ?? ""}
            placeholder="Where? (e.g. Natick library)"
            aria-label="Where it happens"
            onBlur={(e) => void saveQuestPlace(target.task.id, e.target.value).catch(() => {})}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
            className="h-9 rounded-lg border px-2.5 text-[16px]"
            style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
          />
          <DrivePicks taskId={target.task.id} />
        </div>
      ) : (
        <div className="relative z-[1] flex flex-col gap-2 px-3 py-2">
          <span className="text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
            Right after it ends
          </span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-lg border px-2.5 text-[14.5px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }} aria-label="Follow-up title" />
          <div role="radiogroup" aria-label="Length" className="flex gap-1">
            {[10, 15, 30, 45].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={minutes === m}
                onClick={() => setMinutes(m)}
                className="h-8 flex-1 rounded-full text-[13px] font-semibold"
                style={minutes === m ? { background: "rgba(217,180,95,.55)", border: "1px solid #8a6116", color: "var(--t-ink)" } : { border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}
              >
                {m}m
              </button>
            ))}
          </div>
          {error && (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <button type="button" data-submit onClick={addFollowUp} disabled={pending || !title.trim()} className="h-9 rounded-full text-[14px] font-bold disabled:opacity-60" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
            {pending ? "Adding…" : `Add ${minutes}-minute follow-up`}
          </button>
          <span className="text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
            It&rsquo;s a regular quest — open it later to set XP, a board, steps or another portrait.
          </span>
        </div>
      )}
    </div>,
    document.body
  );
}

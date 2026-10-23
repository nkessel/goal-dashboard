"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createQuestAction, unscheduleTaskAction } from "@/app/actions";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import type { Task } from "@/lib/data/types";

export type MenuTarget = { kind: "task"; task: Task; start: Date; end: Date } | { kind: "event"; id: string; title: string; start: Date; end: Date };

/**
 * Right-click (or long-press) on a calendar item: open or unschedule a quest;
 * edit an event or turn it into a quest; and schedule a follow-up quest
 * straight after any quest, event or meeting.
 */
export function CalendarItemMenu({ target, x, y, theme, onClose }: { target: MenuTarget; x: number; y: number; theme: "calm" | "adventure"; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"menu" | "followup">("menu");
  const [minutes, setMinutes] = useState(15);
  const [title, setTitle] = useState(`Follow up: ${target.kind === "task" ? target.task.title : target.title}`.slice(0, 120));
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && !editing && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, editing]);

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

  const W = 250;
  const left = typeof window === "undefined" ? x : Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = typeof window === "undefined" ? y : Math.max(8, Math.min(y, window.innerHeight - 260));
  const item = "relative z-[1] min-h-10 px-3.5 text-left text-[14.5px] hover:bg-black/[.06]";

  if (editing) return <EditTaskModal task={editing} theme={theme} onClose={() => (setEditing(null), onClose())} />;
  return createPortal(
    <div ref={ref} role="menu" className="parchment fixed z-[80] flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
      {mode === "menu" ? (
        <>
          {target.kind === "task" && (
            <>
              <button type="button" role="menuitem" className={item} style={{ color: "var(--t-ink)" }} onClick={() => setEditing(target.task)}>
                Open quest
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                style={{ color: "var(--t-ink)" }}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await unscheduleTaskAction(target.task.id).catch(() => {});
                    router.refresh();
                    onClose();
                  })
                }
              >
                Take off the calendar
              </button>
            </>
          )}
          {target.kind === "event" && (
            <>
              <button type="button" role="menuitem" className={item} style={{ color: "var(--t-ink)" }} onClick={() => (window.dispatchEvent(new CustomEvent("gcal-item", { detail: { id: target.id, action: "edit" } })), onClose())}>
                Edit
              </button>
              <button type="button" role="menuitem" className={item} style={{ color: "var(--t-ink)" }} onClick={() => (window.dispatchEvent(new CustomEvent("gcal-item", { detail: { id: target.id, action: "quest" } })), onClose())}>
                {theme === "adventure" ? "Turn into a quest" : "Turn into a task"}
              </button>
            </>
          )}
          <button type="button" role="menuitem" className={`${item} flex items-center gap-2 border-t`} style={{ color: "var(--t-ink)", borderColor: "rgba(139,112,64,.25)" }} onClick={() => setMode("followup")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- follow-up icon */}
            <img src="/design/icon-followup.svg" alt="" width={20} height={20} />
            Schedule a follow-up quest
          </button>
        </>
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
          <button type="button" onClick={addFollowUp} disabled={pending || !title.trim()} className="h-9 rounded-full text-[14px] font-bold disabled:opacity-60" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
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

import { talkToToucan, type PlanTarget } from "./talk";
import { addJournalEntryAction, coachAddStepsAction, coachCheckInAction, coachLogNightAction, coachNewQuestAction, coachPromiseAction, coachSetDueAction, coachShipFeedbackAction, coachUndoCheckInAction, coachUndoNightAction, completeTaskAction, deleteCheckNoteAction, deleteTaskAction, getQuestForEditAction, logEventAction } from "@/app/actions";
import { type CoachAction, type CoachPromise } from "@/lib/coach";
import { openFocusMode } from "@/lib/focus-timer";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** "today at 6:00 PM", "tomorrow at 9:30 AM" or "Tuesday at 6:00 PM". */
export function eventWhen(d: Date) {
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}

/** "Already done ✓" from his note: the quest is completed, with its celebration. */
export async function completeQuestFromNote(taskId: string) {
  const fd = new FormData();
  fd.set("taskId", taskId);
  const res = await completeTaskAction(fd).catch(() => null);
  if (res) window.dispatchEvent(new Event("toucan-refresh"));
}

/** Begin a promise: its quest in focus mode if it has one, otherwise a word with the toucan. */
export async function beginPromise(p: CoachPromise) {
  void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).catch(() => {});
  if (p.questId) {
    const t = await getQuestForEditAction(p.questId).catch(() => null);
    if (t) return openFocusMode(t);
  }
  talkToToucan(undefined, "talk", `I'm beginning: "${p.text}". Help me take the first step.`);
}

export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Your words in the chat. An answer typed in his note carries what he said: shown small above yours. */
export function UserWords({ text }: { text: string }) {
  const m = text.match(/^You said: “([\s\S]*)”\nMe: ([\s\S]*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="mb-0.5 block text-[12px] italic leading-snug" style={{ opacity: 0.7 }}>
        ↩ “{m[1].length > 90 ? `${m[1].slice(0, 89)}…` : m[1]}”
      </span>
      {m[2]}
    </>
  );
}

/** One thing the toucan offers to do: nothing happens until you tap it. */
export function ActionCard({ action: a, onPlan, onPromise, onAsk }: { action: CoachAction & { auto?: boolean }; onPlan: (p: PlanTarget) => void; onPromise: (p: CoachPromise) => void; onAsk?: (words: string) => void }) {
  if (a.type === "newquest" || a.type === "due" || a.type === "event" || a.type === "checkin" || a.type === "wheel") return <MadeCard action={a} />;
  if (a.type === "ship") return <ShipCard action={a} />;
  return <OfferCard action={a} onPlan={onPlan} onPromise={onPromise} onAsk={onAsk} />;
}

type Made = Extract<CoachAction, { type: "newquest" | "due" | "event" | "checkin" | "wheel" }>;

/** Local wall time from the toucan ("2026-10-30" = end of that day) as an ISO stamp. */
const stampISO = (v: string) => new Date(v.length === 10 ? `${v}T23:59` : v).toISOString();

const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

/**
 * An entry the toucan makes: a quest, an event, a check-in or a night on the
 * Wheel of Time. Made straight away when you asked for it (with an undo),
 * otherwise offered with one button.
 */
function MadeCard({ action: a }: { action: Made & { auto?: boolean } }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error" | "undone">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const undo = useRef<(() => Promise<unknown>) | null>(null);
  const started = useRef(false);
  const short = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const when = (v: string) =>
    new Date(v.length === 10 ? `${v}T12:00` : v).toLocaleString(undefined, v.length === 10 ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label =
    a.type === "newquest"
      ? { icon: "⚔️", kind: "Quest", what: `“${short(a.title)}”${a.due ? ` · due ${when(a.due)}` : ""}${a.minutes ? ` · ${a.minutes} min` : ""}` }
      : a.type === "due"
        ? { icon: "📅", kind: "Due date", what: `“${short(a.quest)}” · ${a.due ? `due ${when(a.due)}` : "no due date"}` }
        : a.type === "event"
        ? { icon: "🏷", kind: "Event", what: `“${short(a.text, 60)}”${a.at ? ` · ${when(a.at)}` : ""}` }
        : a.type === "checkin"
          ? { icon: "💠", kind: "Check-in", what: [...(a.energy !== null ? [`Energy ${a.energy}`] : []), ...a.metrics.map((m) => `${m.metric} ${m.level}`)].join(" · ") }
          : {
              icon: "🌀",
              kind: "Wheel of Time",
              what: [a.day ? `night before ${when(a.day)}` : "last night", a.bed && `bed ${clock12(a.bed)}`, a.wake && `woke ${clock12(a.wake)}`, ...a.effort.map((e) => `✦ ${e}`), ...a.hindrances.map((h) => `↺ ${h}`)].filter(Boolean).join(" · "),
            };
  async function make() {
    setState("busy");
    try {
      if (a.type === "newquest") {
        const id = await coachNewQuestAction(a.title, a.minutes, a.due ? stampISO(a.due) : null);
        undo.current = () => deleteTaskAction(id);
      } else if (a.type === "due") {
        const r = await coachSetDueAction(a.questId, a.due ? stampISO(a.due) : null);
        undo.current = () => coachSetDueAction(a.questId, r.was).then(() => window.dispatchEvent(new Event("toucan-tasks-changed")));
        window.dispatchEvent(new Event("toucan-tasks-changed"));
      } else if (a.type === "event") {
        // "11am" said just after midnight means the 11am that has passed, not later today
        // (Nov 5: it was refused as in the future and showed a bare React error code).
        let at = a.at ? stampISO(a.at) : null;
        if (at && Date.parse(at) > Date.now() + 5 * 60_000 && Date.parse(at) - 86_400_000 > Date.now() - 2 * 86_400_000) at = new Date(Date.parse(at) - 86_400_000).toISOString();
        const r = await logEventAction({ title: a.text, at });
        if (!r.ok) throw new Error(r.error);
        const note = r.note;
        undo.current = () => deleteCheckNoteAction(note.id);
      } else if (a.type === "checkin") {
        const ref = await coachCheckInAction(a.energy, a.metrics);
        undo.current = () => coachUndoCheckInAction(ref);
      } else {
        const r = await coachLogNightAction({ day: a.day, bed: a.bed, wake: a.wake, effort: a.effort, hindrances: a.hindrances });
        undo.current = () => coachUndoNightAction(r.day, r.was);
      }
      setState("done");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  async function takeBack() {
    if (!undo.current) return;
    setState("busy");
    try {
      await undo.current();
      undo.current = null;
      setState("undone");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Couldn't undo that.");
    }
  }
  useEffect(() => {
    if (a.auto && !started.current) {
      started.current = true;
      void make();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the reply arrives
  }, []);
  const verb = a.type === "newquest" ? "Add" : a.type === "due" ? "Change" : "Log";
  return (
    <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.3)" }}>
      <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
        {label.icon} {label.kind}
      </span>
      <span className="text-[14px] leading-snug" style={{ textDecoration: state === "undone" ? "line-through" : undefined, opacity: state === "undone" ? 0.6 : 1 }}>
        {label.what}
      </span>
      {state === "done" ? (
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "#bff7ea" }}>
          {a.type === "newquest" ? "Added ✓" : a.type === "due" ? "Changed ✓" : "Logged ✓"}
          <button type="button" className="underline" onClick={() => void takeBack()}>
            Undo
          </button>
        </span>
      ) : state === "undone" ? (
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "rgba(232,255,248,.6)" }}>
          Taken back.
          <button type="button" className="underline" onClick={() => void make()}>
            {verb} it again
          </button>
        </span>
      ) : state === "error" ? (
        <span className="text-[12.5px]" style={{ color: "#ffb4a8" }}>
          {msg}
        </span>
      ) : (
        <Pill strong onClick={() => void make()}>
          {state === "busy" ? (a.type === "newquest" ? "Adding…" : a.type === "due" ? "Changing…" : "Logging…") : a.type === "newquest" ? "＋ Add this quest" : a.type === "due" ? "Change the due date" : "Log this"}
        </Pill>
      )}
    </div>
  );
}

/**
 * The owner asked the toucan to build their app feedback: it starts the
 * build straight away (or with one button) and links to it.
 */
function ShipCard({ action: a }: { action: Extract<CoachAction, { type: "ship" }> & { auto?: boolean } }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const started = useRef(false);
  async function start() {
    setState("busy");
    try {
      const r = await coachShipFeedbackAction();
      setUrl(r.url);
      setMsg(
        !r.pending
          ? "Nothing new is waiting: every note you've sent is built."
          : r.queued
            ? `Queued ✓ The builder checks in every hour, so your ${r.pending === 1 ? "note starts" : `${r.pending} notes start`} within the hour and go live on their own.`
            : r.already
              ? "A build started a few minutes ago and is still at work on your notes."
              : `Started ✓ Your ${r.pending === 1 ? "note is" : `${r.pending} notes are`} being built. The changes go live on their own when it's done.`,
      );
      setState("done");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Couldn't start the build.");
    }
  }
  useEffect(() => {
    if (a.auto && !started.current) {
      started.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the reply arrives
  }, []);
  return (
    <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(242,210,126,.45)" }}>
      <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
        🛠 App update
      </span>
      <span className="text-[14px] leading-snug">{a.pending ? `${a.pending} feedback note${a.pending === 1 ? "" : "s"} waiting to be built` : "No new feedback waiting"}</span>
      {state === "done" || state === "error" ? (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: state === "done" ? "#bff7ea" : "#ffb4a8" }}>
          {msg}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              Watch it
            </a>
          )}
          {state === "error" && /feedback page|App feedback/.test(msg ?? "") && (
            <a href="/feedback-review" className="underline">
              Open App feedback
            </a>
          )}
        </span>
      ) : a.pending ? (
        <Pill strong onClick={() => void start()}>
          {state === "busy" ? "Starting…" : "Build them now"}
        </Pill>
      ) : null}
    </div>
  );
}

/**
 * A promise he offers. Not take-it-or-leave-it (owner, Nov 6: "I should be able to make a
 * counter-request"): "Counter…" opens his words in place to rewrite, then promise your
 * version or send it back to him as your answer.
 */
function PromiseOffer({ action: a, box, onPromise, onAsk }: { action: Extract<CoachAction, { type: "promise" }>; box: { background: string; border: string }; onPromise: (p: CoachPromise) => void; onAsk?: (words: string) => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error" | "countered">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [counter, setCounter] = useState<string | null>(null);
  async function make(text: string) {
    setState("busy");
    try {
      const list = await coachPromiseAction({ add: { text, when: a.when ? new Date(a.when).toISOString() : null, next: a.next, questId: a.questId } });
      const added = list[list.length - 1];
      if (added) onPromise(added);
      window.dispatchEvent(new Event("toucan-promises"));
      setState("done");
      setMsg(a.when ? "Saved. I'll remind you when it's time ✓" : a.next ? `Saved. I'll remind you next time you see ${a.next} ✓` : "Saved. I'll keep it in mind ✓");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  const words = counter?.trim() ?? "";
  return (
    <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ ...box, border: "1px solid rgba(242,210,126,.45)" }}>
      {counter === null ? (
        <span className="text-[14px] leading-snug">
          “{a.text}”
          <span style={{ color: "rgba(232,255,248,.6)" }}> · {a.when ? when(a.when) : a.next ? `next time: ${a.next}` : "I'll bring it up when you open the app"}</span>
        </span>
      ) : (
        <textarea
          value={counter}
          autoFocus
          rows={2}
          onChange={(e) => setCounter(e.target.value.slice(0, 400))}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setCounter(null);
            }
          }}
          aria-label="Your counter-request"
          className="bare-input w-full resize-none bg-transparent text-[16px] leading-snug sm:text-[14px]"
          style={{ color: "#e8fff8", borderBottom: "1px solid rgba(242,210,126,.55)" }}
        />
      )}
      {state === "done" || state === "error" || state === "countered" ? (
        <span className="text-[12.5px]" style={{ color: state === "error" ? "#ffb4a8" : "#bff7ea" }}>
          {msg}
        </span>
      ) : counter === null ? (
        <span className="flex flex-wrap items-center gap-2">
          <Pill strong onClick={() => void make(a.text)}>
            {state === "busy" ? "Saving…" : /^when\b/i.test(a.text) ? "Make this promise" : "🔔 Remind me"}
          </Pill>
          <button type="button" className="text-[12.5px] underline" style={{ color: "rgba(232,255,248,.75)" }} onClick={() => setCounter(a.text)}>
            Counter…
          </button>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <Pill strong onClick={() => words && void make(words)}>
            {state === "busy" ? "Saving…" : "Promise this instead"}
          </Pill>
          {onAsk && (
            <Pill
              onClick={() => {
                if (!words) return;
                setState("countered");
                setMsg("Sent to him ✓");
                onAsk(`Instead of “${a.text}”: ${words}`);
              }}
            >
              Tell him
            </Pill>
          )}
          <button type="button" className="text-[12.5px] underline" style={{ color: "rgba(232,255,248,.65)" }} onClick={() => setCounter(null)}>
            Back
          </button>
        </span>
      )}
    </div>
  );
}

function OfferCard({ action: a, onPlan, onPromise, onAsk }: { action: CoachAction; onPlan: (p: PlanTarget) => void; onPromise: (p: CoachPromise) => void; onAsk?: (words: string) => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, done: string) {
    setState("busy");
    try {
      await fn();
      setState("done");
      setMsg(done);
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  const box = { background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.3)" };
  const doneLine = state === "done" || state === "error" ? (
    <span className="text-[12.5px]" style={{ color: state === "done" ? "#bff7ea" : "#ffb4a8" }}>
      {msg}
    </span>
  ) : null;
  if (a.type === "plan")
    return (
      <Pill strong onClick={() => onPlan({ id: a.questId, title: a.quest, estimate: null, dueAt: null })}>
        Plan “{a.quest}”
      </Pill>
    );
  if (a.type === "start")
    return (
      <Pill
        strong
        onClick={async () => {
          const t = await getQuestForEditAction(a.questId).catch(() => null);
          if (t) openFocusMode({ ...t, estimate_minutes: a.minutes });
        }}
      >
        ▶ Begin “{a.quest.length > 24 ? `${a.quest.slice(0, 23)}…` : a.quest}” together · {a.minutes} min
      </Pill>
    );
  if (a.type === "steps")
    return (
      <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={box}>
        <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
          Sub-quests for “{a.quest}”
        </span>
        <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-5 text-[13.5px] leading-snug">
          {a.steps.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ol>
        {state === "idle" || state === "busy" ? (
          <Pill strong onClick={() => void run(() => coachAddStepsAction(a.questId, a.steps), "Added to the quest ✓")}>
            {state === "busy" ? "Adding…" : "Add these sub-quests"}
          </Pill>
        ) : (
          doneLine
        )}
      </div>
    );
  if (a.type === "promise") return <PromiseOffer action={a} box={box} onPromise={onPromise} onAsk={onAsk} />;
  if (a.type === "journal")
    return state === "done" || state === "error" ? (
      doneLine
    ) : (
      <Pill onClick={() => void run(() => addJournalEntryAction(a.text, null, "expression"), "Saved to your journal ✓")}>📖 Save this to my journal</Pill>
    );
  return null;
}

export function Pill({ children, onClick, strong = false }: { children: React.ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="min-h-8 rounded-full px-3 py-1 text-left text-[12.5px] font-semibold leading-tight" style={strong ? { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.6)", color: "#e8fff8" } : { border: "1px solid rgba(140,240,220,.3)", color: "rgba(232,255,248,.85)" }}>
      {children}
    </button>
  );
}

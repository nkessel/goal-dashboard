"use client";

import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { useEffect, useRef, useState } from "react";
import { FLOURISHES, readFlourish, saveFlourish, type Flourish } from "@/lib/toucan-flourish";
import { createPortal } from "react-dom";
import { coachAction, coachClearAction, coachForgetAction, coachPromiseAction, coachStateAction, snoozeToucanAction, toucanWatchAction } from "@/app/actions";
import { neglected, type GuideTask, type Nudge } from "@/lib/toucan-guide";
import type { CoachAction, CoachNote, CoachPromise } from "@/lib/coach";
import { GearIcon, CloseIcon } from "@/components/ui/Icons";
import { SettingsGear } from "@/components/ui/SettingsGear";
import { ToucanArt } from "./ToucanArt";
import { Fold } from "@/components/ui/Fold";
import type { Mode, PlanTarget } from "./talk";
import { Digest } from "./Digest";
import { when, UserWords, ActionCard, Pill } from "./ActionCards";
import { CatchUpPlanner } from "./CatchUpPlanner";
import { PlanIt } from "./PlanIt";

type Msg = { role: "user" | "assistant"; content: string; actions?: (CoachAction & { auto?: boolean })[]; remembered?: CoachNote[] };

const PROMPTS: { label: string; say?: string; mode?: Mode; /** Opens something instead of asking. */ open?: () => void }[] = [
  { label: "📚 Get me up to date on my courses", mode: "catchup" },
  { label: "🗓 Plan my day", open: openPlanMyDay },
  { label: "What matters most today?" },
  { label: "I'm overwhelmed", say: "I'm feeling overwhelmed. Everything feels like too much." },
  { label: "Help me start something", say: "I want to get started on something but I can't seem to begin." },
  { label: "I keep avoiding something", say: "There's something I keep avoiding." },
  { label: "Evening reflection", say: "Let's reflect on my day." },
];

export function GuideSheet({
  initialPlan,
  initialMode,
  initialSay,
  onClose,
  onMinimize,
  hidden = false,
  lite = false,
}: {
  initialPlan: PlanTarget | null;
  initialMode: Mode;
  initialSay?: string;
  onClose: () => void;
  onMinimize: () => void;
  /** Minimized: kept (with the conversation) but out of sight. */
  hidden?: boolean;
  lite?: boolean;
}) {
  const [plan, setPlan] = useState<PlanTarget | null>(initialPlan);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [promises, setPromises] = useState<CoachPromise[]>([]);
  const [due, setDue] = useState<CoachPromise[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const [flourish, setFl] = useState<Flourish>(() => (typeof window === "undefined" ? "glow" : readFlourish()));
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const said = useRef(false);
  const talkInput = useRef<HTMLInputElement>(null);
  // On a computer, typing goes straight into the talk line when the chat opens (owner, Nov 5).
  // Not on phones: focusing there would throw the keyboard up unasked.
  useEffect(() => {
    if (hidden || plan || mode !== "talk") return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const id = window.setTimeout(() => talkInput.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, [hidden, plan, mode]);

  useEffect(() => {
    let live = true;
    toucanWatchAction()
      .then((w) => live && setNudges(neglected(w.tasks as GuideTask[], new Date(), w.snoozed, 3)))
      .catch(() => live && setNudges([]));
    if (!lite) coachStateAction()
      .then((c) => {
        if (!live) return;
        // Keep what was said since opening (a reply typed in his note is asked at once, and this
        // used to land after it and wipe it from the chat; owner, Nov 6).
        setMsgs((cur) => [...c.history.slice(-12).map((m) => ({ role: m.role, content: m.content })), ...cur]);
        setNotes(c.notes);
        setPromises(c.promises);
        setDue(c.due);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (hidden) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, hidden]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking, plan]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || thinking) return;
    setError(null);
    setText("");
    setMode("talk");
    setPlan(null);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setThinking(true);
    try {
      const r = await coachAction(question, lite, lite ? msgs.map(({ role, content }) => ({ role, content })) : []);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, actions: r.actions, remembered: r.remembered }]);
      if (r.remembered.length) setNotes((n) => [...n, ...r.remembered]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The toucan is lost in thought.");
    } finally {
      setThinking(false);
    }
  }
  // Opened with something to say (e.g. "Not yet" on a promise).
  useEffect(() => {
    if (initialSay && !said.current) {
      said.current = true;
      void ask(initialSay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  async function settle(p: CoachPromise, status: "kept" | "missed" | "released") {
    setDue((d) => d.filter((x) => x.id !== p.id));
    setPromises((ps) => ps.filter((x) => x.id !== p.id));
    await coachPromiseAction({ settle: { id: p.id, status } }).catch(() => {});
    window.dispatchEvent(new Event("toucan-promises"));
    if (status === "kept") setMsgs((m) => [...m, { role: "assistant", content: `You kept your word: “${p.text}”. That is how a path is made, one honest step at a time. ✦` }]);
    if (status === "missed") void ask(`I didn't keep my promise: "${p.text}".`);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" data-kb-self aria-label="Talk with the Great Toucan Spirit" hidden={hidden}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" style={{ background: "rgba(6,12,14,.45)" }} onClick={onClose} />
      {/* Sized to what's visible, so the keyboard never hides the box you type in. */}
      <section
        className="sheet-up absolute left-1/2 flex w-[min(460px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-3xl"
        style={{ top: "calc(var(--vv-top, 0px) + max(8px, (var(--vvh, 100dvh) - 640px) / 2))", height: "min(640px, calc(var(--vvh, 100dvh) - 28px))", background: "linear-gradient(180deg, #10302f, #0a1f22 60%, #081a1d)", border: "1.5px solid rgba(140,240,220,.45)", color: "#e8fff8", boxShadow: "0 18px 40px rgba(0,0,0,.55)" }}
      >
        <header className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-3">
          <ToucanArt size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display m-0 text-[18px] leading-tight" style={{ color: "#bff7ea" }}>
              The Great Toucan Spirit
            </h2>
            <p className="m-0 truncate text-[12px]" style={{ color: "rgba(232,255,248,.65)" }}>
              {mode === "catchup" ? "Coming up first, then catching up from the beginning" : "Here for the whole of you, and the next small step"}
            </p>
          </div>
          {!lite && (
            <button type="button" onClick={() => {
              setShowNotes((v) => !v);
              scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
            }} aria-expanded={showNotes} title="What I remember" className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] hover:bg-white/10">
              🪶
            </button>
          )}
          <button type="button" onClick={() => {
              setShowLook((v) => !v);
              // Its panel sits at the top of the conversation: go up to it.
              scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
            }} aria-expanded={showLook} title="How I move" aria-label="How the toucan moves" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" style={{ color: "rgba(232,255,248,.75)" }}>
            <GearIcon size={17} />
          </button>
          {/* Minimize keeps the conversation; the small toucan pill brings it back. */}
          <button type="button" onClick={onMinimize} aria-label="Minimize" title="Minimize" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" style={{ color: "rgba(232,255,248,.75)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 18h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3">
          <Fold open={!!showLook}>
            <div className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
              <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                When I share wisdom, I…
              </span>
              <div role="radiogroup" aria-label="How the toucan moves" className="grid grid-cols-2 gap-1.5">
                {FLOURISHES.map((f) => {
                  const on = flourish === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setFl(f.key);
                        saveFlourish(f.key);
                      }}
                      className="flex flex-col items-start rounded-xl px-2.5 py-1.5 text-left"
                      style={on ? { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.7)" } : { border: "1px solid rgba(140,240,220,.2)" }}
                    >
                      <span className="text-[13.5px] font-bold">{f.label}</span>
                      <span className="text-[11.5px] leading-snug" style={{ color: "rgba(232,255,248,.65)" }}>
                        {f.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[12px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                Tap me on my perch to see it.
              </span>
              {/* The rest of how he talks and looks, over the chat; going on to full Settings minimizes it. */}
              <SettingsGear
                to="toucan-spirit"
                text="All my settings"
                label="All the toucan's settings"
                beforeLeave={onMinimize}
                className="mt-0.5 self-start px-2.5 py-1 text-[12.5px] font-semibold hover:bg-white/10"
                style={{ color: "rgba(140,240,220,.9)", border: "1px solid rgba(140,240,220,.3)" }}
              />
            </div>
          </Fold>
          <Fold open={!!showNotes}>
            <div className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
              <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                What I remember about you
              </span>
              {notes.length === 0 && <span className="text-[13px] italic" style={{ color: "rgba(232,255,248,.6)" }}>Nothing yet. I&rsquo;ll keep what you tell me matters (you can remove anything).</span>}
              {notes.map((n) => (
                <span key={n.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                  <span className="flex-1">{n.text}</span>
                  <button type="button" aria-label="Forget this" title="Forget this" onClick={() => (setNotes((x) => x.filter((y) => y.id !== n.id)), void coachForgetAction(n.id).catch(() => {}))} className="shrink-0 px-1 opacity-70 hover:opacity-100">
                    <CloseIcon size={10} />
                  </button>
                </span>
              ))}
              {promises.length > 0 && (
                <>
                  <span className="mt-1 text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                    Reminders &amp; promises
                  </span>
                  {promises.map((p) => (
                    <span key={p.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                      <span className="flex-1">
                        {p.text}
                        {(p.due || p.next) && <span style={{ color: "rgba(232,255,248,.6)" }}> · {p.due ? when(p.due) : `next time: ${p.next}`}</span>}
                      </span>
                      <button type="button" onClick={() => void settle(p, "kept")} className="shrink-0 text-[12px] underline">
                        Done
                      </button>
                      <button type="button" onClick={() => void settle(p, "released")} className="shrink-0 text-[12px] underline opacity-70">
                        Let go
                      </button>
                    </span>
                  ))}
                </>
              )}
              {msgs.length > 0 && (
                <button type="button" onClick={() => (setMsgs([]), void coachClearAction().catch(() => {}))} className="mt-1 self-start text-[12.5px] underline" style={{ color: "rgba(232,255,248,.7)" }}>
                  Start our conversation fresh
                </button>
              )}
            </div>
          </Fold>

          {plan ? (
            <PlanIt key={plan.id} quest={plan} onDone={() => setPlan(null)} />
          ) : mode === "catchup" ? (
            <CatchUpPlanner onBack={() => setMode("talk")} onAsk={(q) => void ask(q)} />
          ) : (
            <>
              {due.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(242,210,126,.1)", border: "1px solid rgba(242,210,126,.45)" }}>
                  <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "#f2d27e" }}>
                    You promised
                  </span>
                  <span className="text-[14.5px] leading-snug">
                    {p.text}
                    {p.due && <span style={{ color: "rgba(232,255,248,.6)" }}> · {when(p.due)}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill strong onClick={() => void settle(p, "kept")}>
                      I did it ✓
                    </Pill>
                    <Pill onClick={() => void settle(p, "missed")}>Not yet</Pill>
                    <Pill onClick={() => void settle(p, "released")}>Let it go</Pill>
                  </span>
                </div>
              ))}

              {msgs.length === 0 &&
                (nudges === null ? (
                  <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                    Looking over your quests…
                  </p>
                ) : nudges.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                      I&rsquo;ve been watching these
                    </p>
                    {nudges.map((n) => (
                      <div key={n.id} className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
                        <span className="text-[14.5px] font-semibold leading-snug">{n.title}</span>
                        <span className="text-[12.5px]" style={{ color: "rgba(232,255,248,.7)" }}>
                          {n.why[0].toUpperCase() + n.why.slice(1)}
                        </span>
                        <span className="flex gap-1.5">
                          <Pill onClick={() => setPlan({ id: n.id, title: n.title, estimate: n.estimate, dueAt: n.dueAt })} strong>
                            {n.step === "estimate" ? "Estimate & plan" : "Plan it"}
                          </Pill>
                          <Pill
                            onClick={() => {
                              void snoozeToucanAction(n.id, 2).catch(() => {});
                              setNudges((ns) => ns?.filter((x) => x.id !== n.id) ?? null);
                            }}
                          >
                            Snooze
                          </Pill>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-[14px]" style={{ color: "rgba(232,255,248,.75)" }}>
                    Nothing important is slipping right now. A fine state of affairs. What&rsquo;s alive in you?
                  </p>
                ))}

              {msgs.map((m, i) => (
                <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <p className="m-0 max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug" style={m.role === "user" ? { background: "rgba(242,210,126,.92)", color: "#2a1c10" } : { background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.25)" }}>
                    {m.role === "assistant" ? <Digest text={m.content} /> : <UserWords text={m.content} />}
                  </p>
                  {m.remembered?.map((n) => (
                    <span key={n.id} className="text-[12px] italic" style={{ color: "rgba(140,240,220,.8)" }}>
                      🪶 I&rsquo;ll remember: {n.text}{" "}
                      <button type="button" className="underline" onClick={() => (setNotes((x) => x.filter((y) => y.id !== n.id)), void coachForgetAction(n.id).catch(() => {}), setMsgs((ms) => ms.map((mm) => (mm === m ? { ...mm, remembered: mm.remembered?.filter((r) => r.id !== n.id) } : mm))))}>
                        Forget
                      </button>
                    </span>
                  ))}
                  {m.actions?.map((a, k) => <ActionCard key={k} action={a} onPlan={setPlan} onPromise={(p) => setPromises((ps) => [...ps, p])} onAsk={(w) => void ask(w)} />)}
                </div>
              ))}
              {thinking && (
                <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                  The toucan ponders…
                </p>
              )}
              {error && (
                <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
                  {error}
                </p>
              )}
              {!thinking && (
                <span className="flex flex-wrap gap-1.5">
                  {PROMPTS.filter((p) => msgs.length === 0 || p.mode === "catchup").map((p) => (
                    <Pill key={p.label} onClick={() => (p.open ? p.open() : p.mode ? setMode(p.mode) : void ask(p.say ?? p.label))}>
                      {p.label}
                    </Pill>
                  ))}
                </span>
              )}
            </>
          )}
        </div>

        {!plan && mode === "talk" && (
          <form
            className="flex shrink-0 items-center gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5"
            style={{ borderTop: "1px solid rgba(140,240,220,.2)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input
              ref={talkInput}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell me what's on your mind…"
              aria-label="Talk with the toucan"
              className="bare-input h-11 min-w-0 flex-1 rounded-full px-4 text-[16px]"
              style={{ background: "rgba(232,255,248,.08)", border: "1px solid rgba(140,240,220,.35)", color: "#e8fff8" }}
            />
            <button type="submit" disabled={!text.trim() || thinking} className="h-11 shrink-0 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1.5px solid #4a3913" }}>
              Send
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}

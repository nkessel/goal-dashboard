"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bossPlanAction, saveBossPlanAction, bossProgressAction, completeTaskAction, createBossQuestAction, linkQuestToBossAction, listBossQuestsAction, listQuestOptionsAction, setBossAction } from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { useEscape } from "@/lib/use-escape";
import { talkToToucan } from "@/components/toucan/ToucanGuide";

export type BossView = { id: string; level: number; title: string; target: number; progress: number };

/**
 * The level badge under the portrait doubles as the boss's door: hover it
 * to see the boss standing between you and the next level, tap it to open
 * the boss (or to name one when the level has none).
 */
export function BossBadge({
  boss,
  level,
  heldByBoss,
  enabled,
  children,
}: {
  boss: BossView | null;
  level: number;
  heldByBoss: boolean;
  /** False before bosses exist (the badge is then just a badge). */
  enabled: boolean;
  children: React.ReactNode;
}) {
  // The badge → the portal (about to enter) → the Final Boss level itself.
  const [stage, setStage] = useState<null | "portal" | "level">(null);
  if (!enabled) return <>{children}</>;
  const tip = boss ? `Final Boss of level ${boss.level}: ${boss.title}${boss.target > 1 ? ` (${boss.progress}/${boss.target})` : ""}` : `No Final Boss guards level ${level} yet`;
  return (
    <>
      <button type="button" onClick={() => setStage("portal")} aria-label={`${tip}. Approach the portal.`} className="group relative block cursor-pointer">
        {children}
        <span
          role="tooltip"
          className="final-boss-tip pointer-events-none absolute left-1/2 top-full z-[60] mt-2.5 w-max max-w-[270px] -translate-x-1/2 rounded-xl px-3.5 py-2.5 text-center text-[13.5px] leading-snug opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 [text-wrap:balance]"
        >
          <span className="block text-[10.5px] font-bold uppercase tracking-[.2em]" style={{ color: "#f2d27e" }}>
            The Final Boss
          </span>
          {boss ? (
            <>
              <span className="font-display mt-0.5 block text-[16px] leading-tight" style={{ color: "#fff4d6" }}>
                {boss.title}
              </span>
              <span className="mt-1 block text-[12px]" style={{ color: "rgba(236,222,255,.82)" }}>
                {boss.target > 1 ? `${boss.progress} of ${boss.target} blows landed · ` : ""}
                {heldByBoss ? `stands between you and level ${level + 1}` : `guards the way to level ${level + 1}`}
              </span>
            </>
          ) : (
            <span className="mt-0.5 block" style={{ color: "#f4ecff" }}>
              No one guards level {level} yet. Name the challenge that stands before level {level + 1}.
            </span>
          )}
          <span className="mt-1.5 block text-[11.5px] italic" style={{ color: "#d9b45f" }}>
            Tap to approach the portal
          </span>
        </span>
      </button>
      {stage === "portal" && <FinalBossPortal boss={boss} level={boss?.level ?? level} onEnter={() => setStage("level")} onClose={() => setStage(null)} />}
      {stage === "level" && <BossDialog boss={boss} level={boss?.level ?? level} onClose={() => setStage(null)} />}
    </>
  );
}

/** Once the level's XP is full: a button straight to the Final Boss, through the same portal. */
export function FaceBossButton({ boss, level }: { boss: BossView | null; level: number }) {
  const [stage, setStage] = useState<null | "portal" | "level">(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setStage("portal")}
        className="font-display hover-glow mx-auto flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px]"
        style={{ background: "linear-gradient(180deg, #4b2a6e, #2a1640)", border: "1.5px solid #d9b45f", color: "#f2d27e", boxShadow: "0 0 12px rgba(160,110,220,.45), 0 2px 6px rgba(0,0,0,.45)" }}
      >
        <span aria-hidden>⚔</span> Face the Final Boss
      </button>
      {stage === "portal" && <FinalBossPortal boss={boss} level={boss?.level ?? level} onEnter={() => setStage("level")} onClose={() => setStage(null)} />}
      {stage === "level" && <BossDialog boss={boss} level={boss?.level ?? level} onClose={() => setStage(null)} />}
    </>
  );
}

/**
 * The entryway: a gold-framed portal in royal purple, about a third of the
 * screen, saying you're about to step into the Final Boss level.
 */
function FinalBossPortal({ boss, level, onEnter, onClose }: { boss: BossView | null; level: number; onEnter: () => void; onClose: () => void }) {
  const [entering, setEntering] = useState(false);
  useEscape(onClose);
  function enter() {
    if (entering) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onEnter();
    setEntering(true);
    setTimeout(onEnter, 520);
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="overlay-fade-in absolute inset-0" style={{ background: "rgba(12,4,24,.6)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Entering the Final Boss level ${level}`}
        onClick={(e) => e.stopPropagation()}
        className={`final-boss-portal relative flex w-[min(92vw,560px)] flex-col items-center justify-center overflow-hidden rounded-[28px] px-6 py-6 text-center ${entering ? "fbp-entering" : "card-pop-in"}`}
        style={{ height: "clamp(250px, 32vh, 380px)" }}
      >
        <span aria-hidden className="fbp-swirl absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span aria-hidden className="fbp-core absolute left-1/2 top-1/2 h-[70%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]" />
        <button type="button" onClick={onClose} aria-label="Not yet" className="absolute right-3 top-3 z-[2] flex h-9 w-9 items-center justify-center rounded-full text-[20px] leading-none hover:bg-white/10" style={{ color: "#e9dcff" }}>
          ×
        </button>
        <div className="relative z-[1] flex flex-col items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[.28em]" style={{ color: "#f2d27e" }}>
            Level {level} · The Final Boss
          </span>
          <p className="font-display m-0 text-[22px] leading-tight sm:text-[26px]" style={{ color: "#fff4d6", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>
            You are about to enter the Final Boss level
          </p>
          <p className="m-0 max-w-[420px] text-[14.5px] italic leading-snug" style={{ color: "rgba(240,228,255,.9)" }}>
            {boss ? <>“{boss.title}” waits beyond. Defeat it, and level {level + 1} opens.</> : <>No Final Boss has been named yet. Step through and name what stands before level {level + 1}.</>}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[14.5px] font-semibold" style={{ color: "#e9dcff", border: "1.5px solid rgba(217,180,95,.55)" }}>
              Not yet
            </button>
            <button type="button" autoFocus onClick={enter} className="hover-glow h-10 rounded-full px-6 text-[15px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", color: "#2a1040", border: "1.5px solid #4a3913", boxShadow: "0 0 18px rgba(242,210,126,.45)" }}>
              Enter
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** The Final Boss level: what it is, landing the blows (its sessions), and working out how to win. */
function BossDialog({ boss, level, onClose }: { boss: BossView | null; level: number; onClose: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!boss);
  const [title, setTitle] = useState(boss?.title ?? "");
  const [target, setTarget] = useState(String(boss?.target ?? 1));
  const [progress, setProgress] = useState(boss?.progress ?? 0);
  const [plan, setPlan] = useState<string | null>(null);
  const [planSaved, setPlanSaved] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  useEscape(onClose);
  useEffect(() => {
    if (!boss) return;
    bossPlanAction(boss.id).then(
      (t) => {
        setPlan(t);
        setPlanSaved(t);
      },
      () => setPlan("")
    );
  }, [boss]);

  function savePlan() {
    if (!boss || plan === null || plan === planSaved) return;
    const t = plan;
    void saveBossPlanAction(boss.id, t).then(() => setPlanSaved(t), () => setError("Couldn't save the battle plan."));
  }
  function askToucan() {
    if (!boss) return;
    savePlan();
    onClose();
    talkToToucan(
      undefined,
      "talk",
      `Help me work out how to beat my Final Boss for level ${boss.level}: "${boss.title}"${boss.target > 1 ? ` (${progress} of ${boss.target} done)` : ""}.${plan?.trim() ? ` My plan so far: ${plan.trim()}` : ""} What's the smallest next step?`
    );
  }

  function step(delta: number) {
    if (!boss) return;
    setError(null);
    setProgress((p) => Math.max(0, Math.min(boss.target, p + delta)));
    startSaving(async () => {
      try {
        const res = await bossProgressAction(boss.id, delta);
        setProgress(res.progress);
        if (res.defeated && delta > 0) {
          celebrateProgress({ title: `Final Boss defeated: ${boss.title}`, xp: 0, fromPct: 100, toPct: 100, heading: "Final Boss defeated!", barCaption: res.leveledUp ? `You reached level ${res.level}!` : `Level ${boss.level + 1} is open to you` });
          onClose();
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await setBossAction(level, title, Number(target) || 1);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  const pct = boss ? Math.round((progress / boss.target) * 100) : 0;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="overlay-fade-in absolute inset-0" style={{ background: "rgba(12,4,24,.66)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Final Boss, level ${level}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
        className="fbp-arrive parchment parchment-framed relative flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-0 shadow-2xl"
        style={{ background: "var(--t-panel)", color: "var(--t-ink)" }}
      >
        {/* The royal banner across the top. */}
        <div className="final-boss-banner relative z-[1] flex flex-col items-center gap-0.5 px-5 pb-4 pt-4 text-center">
          <button type="button" onClick={onClose} aria-label="Leave the Final Boss level" className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none hover:bg-white/10" style={{ color: "#e9dcff" }}>
            ×
          </button>
          <span className="text-[11px] font-bold uppercase tracking-[.26em]" style={{ color: "#f2d27e" }}>
            Level {level} · The Final Boss
          </span>
          {!editing && boss ? (
            <p className="font-display m-0 max-w-[340px] text-[22px] leading-tight" style={{ color: "#fff4d6" }}>
              {boss.title}
            </p>
          ) : (
            <p className="font-display m-0 text-[20px]" style={{ color: "#fff4d6" }}>
              Name the Final Boss
            </p>
          )}
          {!editing && boss && (
            <div className="mt-2 w-full max-w-[300px]">
              <div className="h-[10px] overflow-hidden rounded-full" style={{ background: "rgba(10,2,22,.7)", border: "1.5px solid #a88a3f" }}>
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #b48cff, #f2d27e)", boxShadow: "0 0 8px rgba(242,210,126,.6)" }} />
              </div>
              <span className="mt-1 block text-[12px] tabular-nums" style={{ color: "rgba(236,222,255,.85)" }}>
                {boss.target > 1 ? `${progress} of ${boss.target} blows landed` : progress ? "Defeated" : "Still standing"}
              </span>
            </div>
          )}
          {/* A secret: the mountain view of today, with this boss at the summit. */}
          <Link href="/summit" onClick={onClose} aria-label="A hidden trail…" title="A hidden trail…" className="summit-secret absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full opacity-35 transition-opacity hover:opacity-100" style={{ color: "#e9dcff" }}>
            <svg width="18" height="16" viewBox="0 0 24 20" fill="none" aria-hidden>
              <path d="M1 19L9 6l4 6 3-4 7 11z" fill="currentColor" opacity=".55" />
              <path d="M9 6l-2 3.2 2-.7 1.4 1.5L11 9z" fill="#fff" opacity=".9" />
              <circle cx="9" cy="3" r="1.2" fill="#d9b45f" />
            </svg>
          </Link>
        </div>

        <div className="relative z-[1] flex flex-col gap-3 px-5 pb-5">
          {!editing && boss ? (
            <>
              <h4 className="m-0 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#5b2a86" }}>
                Land the blows
              </h4>
              <BossSessions boss={boss} progress={progress} onStep={step} busy={isSaving} onDone={onClose} />

              <h4 className="m-0 mt-1 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#5b2a86" }}>
                How to beat it
              </h4>
              <textarea
                value={plan ?? ""}
                disabled={plan === null}
                onChange={(e) => setPlan(e.target.value)}
                onBlur={savePlan}
                rows={3}
                placeholder="What makes it hard? What would make it 10% easier? Who could help? What's the first blow?"
                aria-label="Battle plan"
                className="resize-y rounded-lg border px-3 py-2 text-[15px] leading-snug"
                style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.6)" }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={askToucan} className="hover-glow h-10 rounded-full px-4 text-[14px] font-semibold" style={{ background: "linear-gradient(180deg,#4a2470,#2c1248)", color: "#f6e7ff", border: "1.5px solid #a88a3f" }}>
                  Plan it with the Great Toucan Spirit
                </button>
                <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }} aria-live="polite">
                  {plan !== null && plan !== planSaved ? "" : planSaved ? "✓ plan kept" : ""}
                </span>
              </div>
              <p className="m-0 text-center text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                Until it&apos;s defeated you stay at level {level}, however much XP you earn.
              </p>
              <button type="button" onClick={() => setEditing(true)} className="self-center text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                Change this boss
              </button>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-[13.5px] font-semibold">
                What must you defeat before level {level + 1}?
                <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} rows={2} placeholder="e.g. Get 3 training sessions in" className="resize-none rounded-lg border px-3 py-2 text-[16px] font-normal" />
              </label>
              <label className="flex items-center gap-2 text-[13.5px] font-semibold">
                How many blows (times)?
                <input type="number" inputMode="numeric" min={1} max={99} value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 w-20 rounded-lg border px-2 text-center text-[16px]" />
              </label>
              <button type="button" onClick={save} disabled={isSaving || !title.trim()} className="h-11 rounded-full text-[15px] font-semibold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                {isSaving ? "Saving…" : "Save the Final Boss"}
              </button>
            </>
          )}
          {error && (
            <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type BossQuest = Awaited<ReturnType<typeof listBossQuestsAction>>[number];
type Option = Awaited<ReturnType<typeof listQuestOptionsAction>>[number];

/**
 * One outline per session the boss needs (e.g. three training sessions).
 * Fill one with an existing quest or a new one — then finish it here or in
 * the usual quest lists, and it counts. A session can also just be marked
 * done without a quest.
 */
function BossSessions({ boss, progress, onStep, busy, onDone }: { boss: BossView; progress: number; onStep: (d: number) => void; busy: boolean; onDone: () => void }) {
  const router = useRouter();
  const [quests, setQuests] = useState<BossQuest[] | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [slotMode, setSlotMode] = useState<{ i: number; mode: "pick" | "new" } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => listBossQuestsAction(boss.id).then(setQuests).catch(() => setQuests([]));
  useEffect(() => {
    void listBossQuestsAction(boss.id).then(setQuests).catch(() => setQuests([]));
  }, [boss.id]);

  const done = (quests ?? []).filter((q) => q.status === "completed");
  const open = (quests ?? []).filter((q) => q.status !== "completed");
  const manual = Math.max(0, progress - done.length);
  type Slot = { kind: "quest-done"; q: BossQuest } | { kind: "manual" } | { kind: "quest-open"; q: BossQuest } | { kind: "empty" };
  const slots: Slot[] = [
    ...done.map((q) => ({ kind: "quest-done" as const, q })),
    ...Array.from({ length: manual }, () => ({ kind: "manual" as const })),
    ...open.map((q) => ({ kind: "quest-open" as const, q })),
  ];
  while (slots.length < boss.target) slots.push({ kind: "empty" });

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        await load();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function complete(q: BossQuest) {
    run(async () => {
      const fd = new FormData();
      fd.set("taskId", q.id);
      const res = await completeTaskAction(fd);
      celebrateQuest({ taskId: q.id, title: q.title, xp: q.xp_value, iconSrc: q.icon_source === "ai" || q.icon_source === "library" ? q.icon_key : null, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
      if (progress + 1 >= boss.target) {
        celebrateProgress({ title: `Boss defeated: ${boss.title}`, xp: 0, fromPct: 100, toPct: 100, heading: "Final Boss defeated!", barCaption: `Level ${boss.level + 1} is open to you` });
        onDone();
      }
    });
  }

  const art = (q: { id: string; title: string; icon_key: string | null; icon_source: string | null }, size = 36) =>
    (q.icon_source === "ai" || q.icon_source === "library") && q.icon_key ? (
      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
      <img src={q.icon_key} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: "1.5px solid #a58c66" }} />
    ) : (
      <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: "1.5px solid #a58c66" }}>
        <QuestMonogram id={q.id} title={q.title} size={size} />
      </span>
    );
  const check = (on: boolean) => (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: on ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "rgba(255,250,238,.7)", border: `2px solid ${on ? "#2f5a26" : "#a58c66"}` }}>
      {on && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      {quests === null ? (
        <p className="m-0 text-center text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
          Gathering the sessions…
        </p>
      ) : (
        slots.map((sl, i) => {
          const box = "flex min-h-[52px] items-center gap-2.5 rounded-xl px-3 py-2";
          if (sl.kind === "quest-done")
            return (
              <div key={`d-${sl.q.id}`} className={box} style={{ background: "rgba(88,160,74,.12)", border: "1.5px solid rgba(63,106,44,.5)" }}>
                {check(true)}
                {art(sl.q)}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{sl.q.title}</span>
              </div>
            );
          if (sl.kind === "manual")
            return (
              <div key={`m-${i}`} className={box} style={{ background: "rgba(88,160,74,.12)", border: "1.5px solid rgba(63,106,44,.5)" }}>
                {check(true)}
                <span className="min-w-0 flex-1 text-[15px] font-semibold">Session {i + 1} done</span>
                <button type="button" disabled={busy} onClick={() => onStep(-1)} className="text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                  undo
                </button>
              </div>
            );
          if (sl.kind === "quest-open")
            return (
              <div key={`o-${sl.q.id}`} className={box} style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid #b39a6a" }}>
                <button type="button" disabled={isPending} onClick={() => complete(sl.q)} aria-label={`Complete ${sl.q.title}`} className="rounded-full">
                  {check(false)}
                </button>
                {art(sl.q)}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{sl.q.title}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => linkQuestToBossAction(sl.q.id, null))}
                  aria-label={`Take ${sl.q.title} off this boss`}
                  title="Take it off this boss (the quest stays)"
                  className="h-8 w-7 text-[18px] leading-none"
                  style={{ color: "var(--t-ink-soft)" }}
                >
                  ×
                </button>
              </div>
            );
          const choosing = slotMode?.i === i;
          return (
            <div key={`e-${i}`} className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ border: "2px dashed rgba(139,112,64,.5)" }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-auto text-[14.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                  Session {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSlotMode(choosing && slotMode?.mode === "pick" ? null : { i, mode: "pick" });
                    if (!options) void listQuestOptionsAction().then(setOptions).catch(() => setOptions([]));
                  }}
                  className="h-8 rounded-full px-3 text-[13px] font-semibold"
                  style={{ border: "1.5px solid #b39a6a" }}
                >
                  Pick a quest
                </button>
                <button type="button" onClick={() => setSlotMode(choosing && slotMode?.mode === "new" ? null : { i, mode: "new" })} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1.5px solid #b39a6a" }}>
                  New quest
                </button>
                <button type="button" disabled={busy} onClick={() => onStep(1)} title="Count it without a quest" className="h-8 rounded-full px-2.5 text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                  just mark done
                </button>
              </div>
              {choosing && slotMode?.mode === "new" && (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTitle.trim()) {
                        const t = newTitle;
                        setNewTitle("");
                        setSlotMode(null);
                        run(() => createBossQuestAction(boss.id, t));
                      }
                    }}
                    placeholder="e.g. Team Alvim class, Tuesday"
                    aria-label="New session quest"
                    className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px]"
                    style={{ borderColor: "#b39a6a" }}
                  />
                  <button
                    type="button"
                    disabled={!newTitle.trim() || isPending}
                    onClick={() => {
                      const t = newTitle;
                      setNewTitle("");
                      setSlotMode(null);
                      run(() => createBossQuestAction(boss.id, t));
                    }}
                    className="h-9 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50"
                    style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                  >
                    Add
                  </button>
                </div>
              )}
              {choosing && slotMode?.mode === "pick" && (
                <ul className="m-0 flex max-h-[200px] list-none flex-col overflow-y-auto overscroll-contain p-0">
                  {options === null && <li className="py-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>Loading…</li>}
                  {options?.length === 0 && <li className="py-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>No open quests to pick.</li>}
                  {options?.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSlotMode(null);
                          setOptions((list) => list?.filter((x) => x.id !== o.id) ?? list);
                          run(() => linkQuestToBossAction(o.id, boss.id));
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left text-[14.5px] hover:bg-black/5"
                      >
                        {art(o, 26)}
                        <span className="min-w-0 flex-1 truncate">{o.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

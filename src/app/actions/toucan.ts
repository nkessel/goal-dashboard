"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { writeExtra } from "@/lib/data/extras";
import { revalidatePath } from "next/cache";
import * as profilesData from "@/lib/data/profiles";
import * as winsData from "@/lib/data/wins";
import * as energyData from "@/lib/data/energy";
import * as tomorrowData from "@/lib/data/tomorrow";
import * as feedbackData from "@/lib/data/feedback";
import * as tasksData from "@/lib/data/tasks";
import * as stepsData from "@/lib/data/steps";
import { requireSessionMaybeGoogle, guideTasks, readExtras, requireProfileId, cleanPriorities } from "./_shared";
import { saveNightAction } from "./evening";

/** What the toucan keeps an eye on: your open quests (scored in the browser, in your time zone) and what you've waved off. With `guesses`, also quests whose deadline looks like an event on your calendar. */
export async function toucanWatchAction(opts: { guesses?: boolean } = {}) {
  const { profileId: ownerId, accessToken } = await requireSessionMaybeGoogle();
  const [tasks, extras] = await Promise.all([guideTasks(ownerId), readExtras(ownerId)]);
  const { cleanCoach, duePromises, readyReminders } = await import("@/lib/coach");
  const coach = cleanCoach(extras.coach);
  const asked = (extras.toucanDueAsked as Record<string, string> | undefined) ?? {};
  const wantNext = coach.promises.some((p) => p.status === "open" && p.next);
  const wantGuesses = !!opts.guesses && tasks.some((t) => !t.due_at && !asked[t.id]);
  // "Next time" reminders look at your calendar from a little while ago to tomorrow morning;
  // deadline guesses look a week ahead.
  let events: { title: string; start: string; end: string }[] = [];
  if (accessToken && (wantNext || wantGuesses)) {
    try {
      const { listEventsAllCalendars } = await import("@/lib/google-calendar");
      const now = Date.now();
      const all = await listEventsAllCalendars(accessToken, new Date(now - 3 * 3_600_000), new Date(now + (wantGuesses ? 8 * 86_400_000 : 20 * 3_600_000)));
      events = all.events.filter((e) => Date.parse(e.end) > now).map((e) => ({ title: e.title, start: e.start, end: e.end }));
    } catch {
      /* no calendar right now: the reminder waits */
    }
  }
  const soonEvents = events.filter((e) => Date.parse(e.start) < Date.now() + 20 * 3_600_000);
  const { nextNear, standing } = readyReminders(coach.promises, soonEvents);
  const { deadlineGuesses } = await import("@/lib/toucan-guide");
  const guesses = wantGuesses ? deadlineGuesses(tasks, events, asked) : [];
  return { tasks, snoozed: ((extras.toucanSnooze as Record<string, string> | undefined) ?? {}), promises: coach.promises.filter((p) => p.status === "open"), due: duePromises(coach), nextNear, standing, guesses };
}

/** The toucan asked "is this due before <event>?": yes sets the due date; either way it won't ask about this quest again. */
export async function answerDeadlineGuessAction(taskId: string, dueAt: string | null) {
  const ownerId = await requireProfileId();
  if (dueAt) {
    const when = new Date(dueAt);
    if (Number.isNaN(when.getTime())) throw new Error("That date didn't look right.");
    const { error } = await supabaseAdmin().from("tasks").update({ due_at: when.toISOString() }).eq("id", taskId).eq("owner_id", ownerId);
    if (error) throw new Error(`Couldn't set the due date: ${error.message}`);
  }
  const extras = await readExtras(ownerId);
  const asked = { ...((extras.toucanDueAsked as Record<string, string> | undefined) ?? {}), [taskId.slice(0, 40)]: new Date().toISOString() };
  // Keep the record small: the most recent 200 answers.
  const kept = Object.fromEntries(Object.entries(asked).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200));
  await writeExtra(ownerId, "toucanDueAsked", kept);
  revalidatePath("/");
}

/** "Not now": the toucan won't raise this quest again for a while. */
export async function snoozeToucanAction(taskId: string, days = 1) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries((extras.toucanSnooze as Record<string, string> | undefined) ?? {}).filter(([, until]) => Date.parse(until) > now));
  kept[taskId.slice(0, 40)] = new Date(now + Math.max(0.01, Math.min(30, days)) * 86_400_000).toISOString();
  await writeExtra(ownerId, "toucanSnooze", kept);
}

/** Save how long a quest will take (the first rung: estimate, schedule, do). */
export async function setQuestEstimateAction(taskId: string, minutes: number) {
  const ownerId = await requireProfileId();
  const m = Math.max(5, Math.min(600, Math.round(minutes)));
  const { error } = await supabaseAdmin().from("tasks").update({ estimate_minutes: m }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't save the estimate: ${error.message}`);
  revalidatePath("/");
}

// ---- The Great Toucan Spirit as a guide: memory, promises, and the actions it offers.
async function readCoach(ownerId: string) {
  const extras = await readExtras(ownerId);
  const { cleanCoach } = await import("@/lib/coach");
  return { extras, coach: cleanCoach(extras.coach) };
}

async function writeCoach(ownerId: string, extras: Record<string, unknown>, coach: import("@/lib/coach").CoachState) {
  await writeExtra(ownerId, "coach", coach);
}

/** The conversation so far (recent part), what it remembers and your promises. */
export async function coachStateAction() {
  const ownerId = await requireProfileId();
  const { coach } = await readCoach(ownerId);
  const { duePromises } = await import("@/lib/coach");
  return { history: coach.history.slice(-24), notes: coach.notes, promises: coach.promises.filter((p) => p.status === "open"), due: duePromises(coach) };
}

/** Talk with the Great Toucan Spirit. It sees your quests, recent wins and check-ins, and remembers what you've shared. */
export async function coachAction(message: string, lite = false, liteHistory: { role: "user" | "assistant"; content: string }[] = []) {
  const ownerId = await requireProfileId();
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Say something first.");
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("The toucan can't talk yet: the AI service isn't set up.");
  const tz = process.env.APP_TIMEZONE || "America/New_York";
  const now = new Date();
  const db = supabaseAdmin();
  const [{ extras, coach }, tasks, profile, wins, checks, boardsRes, aspRes, metrics] = await Promise.all([
    readCoach(ownerId),
    guideTasks(ownerId, { imports: true }),
    profilesData.getProfileById(ownerId),
    winsData.listWinsSince(ownerId, new Date(now.getTime() - 3 * 86_400_000).toISOString()).catch(() => []),
    energyData.latestCheckIns(ownerId, new Date(now.getTime() - 36 * 3_600_000).toISOString()).catch(() => ({})),
    db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId),
    db.from("tasks").select("title").eq("owner_id", ownerId).eq("status", "open").eq("is_aspiration", true).limit(12),
    energyData.getCheckMetrics(ownerId).catch(() => [] as string[]),
  ]);
  const { contextLines } = await import("@/lib/toucan-guide");
  const { coachSystemPrompt, parseReply, asksToMake, asksToShip, MAKES } = await import("@/lib/coach");
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const wheel = cleanWheel(extras.wheelOfTime);
  const { mentioned } = await import("@/lib/toucan-guide");
  const { catchUpPlan, catchUpOrder } = await import("@/lib/catch-up");
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  const who = profile?.name?.split(" ")[0] || "friend";
  const boards = (boardsRes.data ?? []) as { id: string; title: string; parent_board_id: string | null }[];
  // Coursework in the agreed order: what's coming up first, then catching up from the beginning.
  const courseIds = new Set(((extras.catchUp as { boards?: string[] } | undefined)?.boards ?? []).filter((id) => boards.some((b) => b.id === id)));
  const course = catchUpOrder(catchUpPlan(tasks.filter((t) => t.board_id && courseIds.has(t.board_id)), now)).slice(0, 14);
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: tz });
  const today = tasks.filter((t) => t.scheduled_start && new Date(t.scheduled_start).toLocaleDateString("en-CA", { timeZone: tz }) === todayKey).map((t) => `- ${new Date(t.scheduled_start!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}: "${t.title}"`);
  const questLines = contextLines(tasks.map((t) => (t.needs_review ? { ...t, title: t.title, board: `${t.board ?? "no board"}, imported, not yet sorted` } : t)), now, 60);
  const { cleanStyle, styleLines } = await import("@/lib/toucan-style");
  const system = coachSystemPrompt({
    who,
    when: now.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }),
    quests: [
      ...(course.length ? [`Coursework, in the order they chose (coming up first, then catching up from the beginning): ${course.map((c, i) => `${i + 1}. "${c.title}"${c.due_at ? ` (due ${fmtWhen(c.due_at)})` : ""}`).join("; ")}`] : []),
      ...questLines,
    ],
    aspirations: ((aspRes.data ?? []) as { title: string }[]).map((a) => `- ${a.title}`),
    areas: boards.filter((b) => !b.parent_board_id).map((b) => `- ${b.title}`),
    wins: (wins as { kind: string; title: string; at: string }[]).filter((w) => w.kind !== "login" && w.kind !== "feedback").slice(0, 12).map((w) => `- ${w.title} (${fmtWhen(w.at)})`),
    checkIn: Object.entries(checks as Record<string, { level: number; at: string }>).slice(0, 8).map(([k, v]) => `- ${k}: ${v.level}`),
    today,
    notes: lite ? [] : coach.notes.map((n) => `- ${n.text}`),
    promises: lite ? [] : coach.promises.filter((p) => p.status === "open").map((p) => `- ${p.text}${p.due ? ` (for ${fmtWhen(p.due)})` : p.next ? ` (next time: ${p.next})` : ""}`),
    style: styleLines(cleanStyle(extras.toucanStyle)),
    lite,
    todayKey: `${todayKey} (${now.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })})`,
    metrics,
    effort: wheel.effort,
    hindrances: wheel.hindrances,
    priorities: cleanPriorities(extras.priorities)
      .filter((p) => Date.parse(p.at) > now.getTime() - 35 * 86_400_000)
      .slice(0, 12)
      .map((p, i) => `- ${p.day === tomorrowData.appDayKey() ? "Today" : new Date(`${p.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}${i === 0 ? " (latest)" : ""}: ${p.text.replace(/\n+/g, "; ")}${p.others?.length ? ` · other priorities: ${p.others.join("; ")}` : ""}`),
  });
  // The app's owner asking to build their feedback: the app starts that build (a card shows it).
  const ship = !lite && asksToShip(text) && (await feedbackData.isAdmin(ownerId)) ? await (await import("@/lib/data/feedback-run")).pendingFeedback(ownerId) : null;
  const shipLine =
    ship === null
      ? ""
      : `\n\nThey are asking you to build their app feedback. The app is starting that build right now (${ship} note${ship === 1 ? "" : "s"} waiting) and shows a card for it. Say in a sentence or two that you've sent ${ship ? `their ${ship} note${ship === 1 ? "" : "s"}` : "it"} to the builders and the changes go live on their own when they're done${ship ? "" : " (though nothing new is waiting right now)"}. Offer no ACTIONS line.`;
  // The light guide keeps no memory: it sees only this conversation.
  const past = lite ? liteHistory.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) })) : coach.history.slice(-12);
  const history = [...past, { role: "user" as const, content: text }];
  const messages = [{ role: "system", content: system + shipLine }, ...history.map((m) => ({ role: m.role, content: m.content }))];
  let raw = "";
  for (const model of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"]) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_tokens: 520, temperature: 0.65, messages }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      raw = String(json?.result?.response ?? "").trim();
      if (raw) break;
    } catch {
      /* try the next model */
    }
  }
  if (!raw) throw new Error("The toucan is lost in thought. Try again in a moment.");
  const { text: reply, actions: parsed } = parseReply(raw, tasks, { metrics, effort: wheel.effort, hindrances: wheel.hindrances });
  // Asked to add or log something: the app makes those entries itself (each with an undo).
  const makeNow = asksToMake(text);
  const actions = ship !== null ? [{ type: "ship" as const, pending: ship, auto: true }] : parsed.map((a) => ((MAKES as readonly string[]).includes(a.type) ? { ...a, auto: makeNow } : a));
  if (lite) {
    // Plan buttons for the quests it names; nothing remembered.
    const named = mentioned(reply, tasks).map((q) => ({ type: "plan" as const, questId: q.id, quest: q.title }));
    return { reply, actions: named, remembered: [] as import("@/lib/coach").CoachNote[] };
  }
  // What it learns about you, it keeps (you can see and remove each note).
  const remembered = actions.filter((a): a is Extract<typeof a, { type: "remember" }> => a.type === "remember").map((a) => ({ id: crypto.randomUUID().slice(0, 8), text: a.note, at: now.toISOString() }));
  const stamp = now.toISOString();
  const next = {
    ...coach,
    history: [...coach.history, { role: "user" as const, content: text, at: stamp }, { role: "assistant" as const, content: reply, at: stamp }].slice(-40),
    notes: [...coach.notes, ...remembered].slice(-30),
  };
  await writeCoach(ownerId, extras, next);
  return { reply, actions: actions.filter((a) => a.type !== "remember"), remembered };
}

/** Start the conversation over (what it remembers about you stays, unless you remove it). */
export async function coachClearAction() {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  await writeCoach(ownerId, extras, { ...coach, history: [] });
}

/** Remove something the toucan remembered. */
export async function coachForgetAction(noteId: string) {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  await writeCoach(ownerId, extras, { ...coach, notes: coach.notes.filter((n) => n.id !== noteId) });
}

/** Make a promise (a "when…, then I will…"), or settle one: kept, missed or let go. */
export async function coachPromiseAction(input: { add?: { text: string; when: string | null; next?: string | null; questId?: string | null }; settle?: { id: string; status: "kept" | "missed" | "released" }; push?: { id: string; minutes: number } }) {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  let promises = coach.promises;
  if (input.add) {
    const due = input.add.when ? new Date(input.add.when) : null;
    promises = [...promises, { id: crypto.randomUUID().slice(0, 8), text: input.add.text.slice(0, 180), due: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null, next: input.add.next?.trim().slice(0, 40) || null, questId: input.add.questId ?? null, status: "open" as const, at: new Date().toISOString() }];
  }
  if (input.settle) promises = promises.map((p) => (p.id === input.settle!.id ? { ...p, status: input.settle!.status } : p));
  if (input.push) promises = promises.map((p) => (p.id === input.push!.id ? { ...p, due: new Date(Date.now() + input.push!.minutes * 60_000).toISOString() } : p));
  await writeCoach(ownerId, extras, { ...coach, promises: promises.slice(-30) });
  return promises.filter((p) => p.status === "open");
}

/** Add small steps to a quest (after the ones it already has). */
export async function coachAddStepsAction(taskId: string, titles: string[]) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  const existing = (await stepsData.listStepsForTask(taskId, ownerId)) ?? [];
  const fresh = titles.map((t) => t.trim()).filter(Boolean).slice(0, 8);
  await stepsData.replaceSteps(taskId, ownerId, [
    ...existing.map((st) => ({ id: st.id, title: st.title, done: st.done, xp: st.xp ?? undefined, weight: st.weight ?? null, progress: st.progress ?? undefined, seconds: st.seconds_spent ?? undefined, state: st.state ?? null })),
    ...fresh.map((title) => ({ title, done: false })),
  ]);
  revalidatePath("/");
}

/** A quest the toucan suggested (something you named that wasn't on your list yet). */
export async function coachNewQuestAction(title: string, minutes: number | null, dueISO: string | null = null) {
  const ownerId = await requireProfileId();
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) throw new Error("Give it a name.");
  const due = dueISO && Number.isFinite(Date.parse(dueISO)) ? new Date(dueISO).toISOString() : null;
  const task = await tasksData.createTask(ownerId, { title: t, importance: 3, urgency: 3, xpValue: 15, estimateMinutes: minutes ?? null, dueAt: due });
  revalidatePath("/");
  return task.id;
}

/** The toucan moves a quest's due date when asked ("make it due Monday"); returns the old one for Undo. */
export async function coachSetDueAction(taskId: string, dueISO: string | null) {
  const ownerId = await requireProfileId();
  const due = dueISO && Number.isFinite(Date.parse(dueISO)) ? new Date(dueISO).toISOString() : null;
  const db = supabaseAdmin();
  const { data: was, error: readErr } = await db.from("tasks").select("due_at").eq("id", taskId).eq("owner_id", ownerId).maybeSingle();
  if (readErr || !was) throw new Error("Couldn't find that quest.");
  const { error } = await db.from("tasks").update({ due_at: due }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't change the due date: ${error.message}`);
  revalidatePath("/");
  return { was: (was as { due_at: string | null }).due_at };
}

/** Start building the owner's app feedback (the toucan's "ship" card). Only the app's owner can. */
export async function coachShipFeedbackAction() {
  const ownerId = await requireProfileId();
  if (!(await feedbackData.isAdmin(ownerId))) throw new Error("Only the app's owner can start an update.");
  const run = await import("@/lib/data/feedback-run");
  const pending = await run.pendingFeedback(ownerId);
  if (!pending) return { url: null, already: false, queued: false, pending };
  const r = await run.startRun(pending);
  return { url: r.url, already: !!r.already, queued: !!r.queued, pending };
}

/** Save (or remove, with "") the token that lets the app start feedback builds. */
export async function saveFeedbackRunTokenAction(token: string) {
  const ownerId = await requireProfileId();
  if (!(await feedbackData.isAdmin(ownerId))) throw new Error("Only the app's owner can change that.");
  await (await import("@/lib/data/feedback-run")).saveRunToken(token);
  revalidatePath("/feedback-review");
}

/** A check-in the toucan logged; returns what it saved so it can be undone. */
export async function coachCheckInAction(energy: number | null, metrics: { metric: string; level: number }[]) {
  const ownerId = await requireProfileId();
  if (energy === null && !metrics.length) throw new Error("Nothing to check in yet.");
  const entry = energy === null ? null : await energyData.logEnergy(ownerId, energy);
  const extra = metrics.length ? await energyData.logCheckIns(ownerId, metrics) : [];
  revalidatePath("/");
  revalidatePath("/insights");
  return { energyId: entry?.id ?? null, checkInIds: extra.map((r) => r.id).filter((id): id is string => !!id) };
}

/** Take back a check-in the toucan logged. */
export async function coachUndoCheckInAction(ref: { energyId: string | null; checkInIds: string[] }) {
  const ownerId = await requireProfileId();
  await energyData.deleteReadings(ownerId, ref.energyId ? [ref.energyId] : [], ref.checkInIds);
  revalidatePath("/");
  revalidatePath("/insights");
}

/**
 * A night the toucan logged on the Wheel of Time, added to what's already
 * there for that morning. Returns the night as it was, for undo.
 */
export async function coachLogNightAction(input: { day: string | null; bed: string | null; wake: string | null; effort: string[]; hindrances: string[] }) {
  const ownerId = await requireProfileId();
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const wheel = cleanWheel((await readExtras(ownerId)).wheelOfTime);
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : tomorrowData.appDayKey();
  const was = wheel.log[day] ?? null;
  const hindrances = [...(was?.hindrances ?? [])];
  for (const h of input.hindrances) if (!hindrances.some((x) => x.name === h)) hindrances.push({ name: h });
  await saveNightAction({ day, bed: input.bed ?? was?.bed ?? null, wake: input.wake ?? was?.wake ?? null, effort: [...new Set([...(was?.effort ?? []), ...input.effort])], hindrances });
  return { day, was };
}

/** Put a night back the way it was before the toucan logged it. */
export async function coachUndoNightAction(day: string, was: import("@/lib/wheel-of-time").NightLog | null) {
  await saveNightAction({ day, bed: was?.bed ?? null, wake: was?.wake ?? null, effort: was?.effort ?? [], hindrances: was?.hindrances ?? [] });
}

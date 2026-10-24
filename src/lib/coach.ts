/**
 * The Great Toucan Spirit as a guide: its memory (what you've talked about,
 * what it has learned about you, the promises you've made) and the small,
 * concrete actions it can offer at the end of a reply. Pure, shared by the
 * server (which talks to the model) and the browser (which shows the cards).
 */

export type CoachMsg = { role: "user" | "assistant"; content: string; at?: string };
export type CoachNote = { id: string; text: string; at: string };
/** A promise or reminder. `next` ("Dad") means "next time": it comes up when a calendar event that mentions it is near. */
export type CoachPromise = { id: string; text: string; due: string | null; next?: string | null; questId?: string | null; status: "open" | "kept" | "missed" | "released"; at: string };
export type CoachState = { history: CoachMsg[]; notes: CoachNote[]; promises: CoachPromise[] };

export type CoachAction =
  | { type: "steps"; questId: string; quest: string; steps: string[] }
  | { type: "plan"; questId: string; quest: string }
  | { type: "start"; questId: string; quest: string; minutes: number }
  | { type: "promise"; text: string; when: string | null; next: string | null; questId: string | null }
  | { type: "newquest"; title: string; minutes: number | null }
  | { type: "journal"; text: string }
  | { type: "remember"; note: string };

const s = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function cleanCoach(raw: unknown): CoachState {
  const r = (raw ?? {}) as Partial<CoachState>;
  const history = (Array.isArray(r.history) ? r.history : [])
    .filter((m): m is CoachMsg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000), at: typeof m.at === "string" ? m.at : undefined }));
  const notes = (Array.isArray(r.notes) ? r.notes : []).filter((n): n is CoachNote => !!n && typeof n.text === "string" && typeof n.id === "string").slice(-30);
  const promises = (Array.isArray(r.promises) ? r.promises : []).filter((p): p is CoachPromise => !!p && typeof p.text === "string" && typeof p.id === "string").slice(-30);
  return { history, notes, promises };
}

/** Find the quest a reply means: exact title first, then the closest containing match. */
function matchQuest(title: string, quests: { id: string; title: string }[]) {
  const t = title.trim().toLowerCase().replace(/^["“]|["”]$/g, "");
  if (!t) return null;
  return quests.find((q) => q.title.trim().toLowerCase() === t) ?? quests.find((q) => q.title.toLowerCase().includes(t) || t.includes(q.title.toLowerCase())) ?? null;
}

/**
 * Split a model reply into the words to show and the actions it offers
 * (a final "ACTIONS: [...]" line). Anything malformed is quietly dropped.
 */
export function parseReply(raw: string, quests: { id: string; title: string }[]): { text: string; actions: CoachAction[] } {
  // The actions line is never shown, even when it's malformed. Models sometimes
  // drop the square brackets ({...},{...}) or wrap the JSON in a code fence.
  const m = raw.match(/\n?[ \t]*(?:`{3}\w*\s*)?ACTIONS:\s*([\s\S]*)$/i);
  const text = (m ? raw.slice(0, m.index) : raw).trim();
  if (!m) return { text, actions: [] };
  let body = m[1].replace(/`{3}/g, "").trim();
  if (body.startsWith("{")) body = `[${body}]`;
  let list: unknown[] = [];
  try {
    list = JSON.parse(body);
  } catch {
    return { text, actions: [] };
  }
  const out: CoachAction[] = [];
  for (const a of Array.isArray(list) ? list : []) {
    const o = (a ?? {}) as Record<string, unknown>;
    const type = s(o.type, 20);
    if (type === "steps" || type === "plan" || type === "start") {
      const q = matchQuest(s(o.quest), quests);
      if (!q) continue;
      if (type === "steps") {
        const steps = (Array.isArray(o.steps) ? o.steps : []).map((x) => s(x, 120)).filter(Boolean).slice(0, 8);
        if (steps.length) out.push({ type, questId: q.id, quest: q.title, steps });
      } else if (type === "plan") out.push({ type, questId: q.id, quest: q.title });
      else out.push({ type, questId: q.id, quest: q.title, minutes: Math.max(5, Math.min(90, Math.round(Number(o.minutes) || 15))) });
    } else if (type === "promise") {
      const text = s(o.text, 180);
      if (!text) continue;
      const when = s(o.when, 30);
      const q = s(o.quest) ? matchQuest(s(o.quest), quests) : null;
      const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? when.slice(0, 16) : null;
      const next = at ? null : s(o.next, 40) || null;
      out.push({ type, text, when: at, next, questId: q?.id ?? null });
    } else if (type === "newquest") {
      const title = s(o.title, 120);
      if (title && !matchQuest(title, quests)) out.push({ type, title, minutes: Number(o.minutes) > 0 ? Math.min(480, Math.round(Number(o.minutes))) : null });
    } else if (type === "journal") {
      const text = s(o.text, 1500);
      if (text) out.push({ type, text });
    } else if (type === "remember") {
      const note = s(o.note, 200);
      if (note) out.push({ type, note });
    }
  }
  return { text, actions: out.slice(0, 4) };
}

/** Does a calendar event mention this "next time" word (whole word, any case)? */
export function eventMentions(title: string, next: string) {
  const w = next.trim().toLowerCase().replace(/^(my|the)\s+/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!w && new RegExp(`(^|[^a-z0-9])${w}('?s)?([^a-z0-9]|$)`, "i").test(title);
}

/**
 * What's worth bringing up now, besides promises whose time has passed:
 * "next time" reminders whose calendar event is near (soonest first), and
 * reminders with no time at all, to keep in mind.
 */
export function readyReminders(promises: CoachPromise[], events: { title: string; start: string; end: string }[]) {
  const open = promises.filter((p) => p.status === "open");
  const nextNear = open
    .filter((p) => p.next)
    .flatMap((p) => {
      const e = events.filter((ev) => eventMentions(ev.title, p.next!)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
      return e ? [{ promise: p, event: e }] : [];
    });
  const standing = open.filter((p) => !p.due && !p.next);
  return { nextNear, standing };
}

/** Promises whose time has come and that haven't been followed up. */
export function duePromises(state: CoachState, now = Date.now()) {
  return state.promises.filter((p) => p.status === "open" && p.due && Date.parse(p.due) <= now);
}

export function coachSystemPrompt(o: {
  who: string;
  when: string;
  quests: string[];
  aspirations: string[];
  areas: string[];
  wins: string[];
  checkIn: string[];
  today: string[];
  notes: string[];
  promises: string[];
  /** The light guide: kind and practical, no memory and no action cards. */
  lite?: boolean;
}) {
  const block = (title: string, lines: string[], empty = "(none)") => `${title}:\n${lines.length ? lines.join("\n") : empty}`;
  return [
    `You are the Great Toucan Spirit: ancient, wise, compassionate and a little wry, the guide who lives in ${o.who}'s quest app. It is ${o.when}.`,
    `You carry two gifts in one voice. A spiritual companion: presence, the breath, meaning and values, self-compassion, gratitude, the long view of a life. ${o.who} practises mindfulness, Nonviolent Communication and authentic relating, so you may speak in feelings and needs and invite noticing what's here. And a practical guide for getting things done: make the first step tiny and concrete; break big quests into small steps; estimate how long; give it a time on the calendar; start together now with a short timer; turn intentions into "when…, then I will…" promises; untangle overwhelm by listing everything, then choosing one; meet avoidance with curiosity, not judgment (what feels heavy about it? what would make it 10% easier?); close the day by noticing what went well; celebrate what got done.`,
    `When they ask for something practical (a reminder, a task, a quick fix), just help: keep it short and don't ask about feelings.`,
    `Read the moment. If they are hurting or overwhelmed, slow down and attune first (reflect what they might be feeling and needing) before any plan. If they are stuck, make it smaller. If they are doing well, celebrate and point at the next step. Connect quests to what matters to them when it helps.`,
    `When they ask you to plan their day: lead with anything overdue or due today or tomorrow, then what matters most; give 3 to 5 quests in order, each with a rough time that fits the gaps around today's calendar (and how long it takes). Offer plan or start actions for the first ones. Nothing goes on their calendar unless they press a button.`,
    `Never call yourself a coach or use clinical terms like "executive function". Ask at most one question per reply. Refer to quests by their exact title in double quotes. Only talk about quests in the lists below; never invent quests, dates or facts. Keep replies under 110 words, plain text. You are not a therapist: if they mention crisis or harming themselves, respond with warmth and encourage reaching a trusted person or a professional (in the US, call or text 988).`,
    o.lite ? `Plain words only; offer no ACTIONS line.` : `After your words you may offer up to 3 actions on one final line, exactly: ACTIONS: [ ...json... ] — always a JSON array in square brackets, even for one action. Types:
{"type":"steps","quest":"<exact title>","steps":["tiny concrete step", ...]}  (2–6 steps)
{"type":"plan","quest":"<exact title>"}  (estimate it and give it a time)
{"type":"start","quest":"<exact title>","minutes":10}  (begin together now)
{"type":"promise","text":"When …, I will …","when":"YYYY-MM-DDTHH:MM","next":"","quest":"<exact title or empty>"}  (also for every "remind me…" / "don't let me forget…", one promise per thing. "when": if they gave a time. "next": for "next time I see/visit/am at X", the one word for X as it would appear on their calendar, e.g. "Dad" or "Tiffany". Neither? Leave both empty: it's kept in mind and brought up when they open the app. The card is the confirmation, so don't ask "shall I?")
{"type":"newquest","title":"…","minutes":20}  (only for something they named that isn't in the list)
{"type":"journal","text":"…"}  (save a reflection they wrote, in their words)
{"type":"remember","note":"…"}  (a lasting fact about them: values, what helps, what's hard. Never for reminders, errands or to-dos)
Offer actions only when they fit; often none. Omit the ACTIONS line when there are none.`,
    block("What you remember about them", o.notes),
    block("Their promises and reminders (if they mention being with someone or somewhere marked \"next time\", bring that reminder up)", o.promises),
    block("Their life areas (boards)", o.areas),
    block("Their aspirations (dreams, not yet quests)", o.aspirations),
    block("Done recently", o.wins),
    block("How they checked in lately (1–10)", o.checkIn),
    block("On the calendar today", o.today),
    block("Open quests", o.quests),
  ].join("\n\n");
}

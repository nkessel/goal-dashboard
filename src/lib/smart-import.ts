import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TaskContext } from "@/lib/data/types";

/**
 * Smart import: turn a photo (handwritten list, whiteboard, screenshot,
 * flyer) or a pasted text list into proposed tasks. Claude is forced to
 * answer through a single tool so the output is always structured JSON;
 * nothing is written here — the user reviews the proposals first.
 */

export type ImportedTask = {
  title: string;
  description: string | null;
  estimateMinutes: number | null;
  importance: number;
  urgency: number;
  dueBy: string | null;
  context: TaskContext | null;
  isUpkeep: boolean;
};

const MODEL = process.env.SMART_IMPORT_MODEL || "claude-sonnet-5-5";
const CONTEXTS: TaskContext[] = ["out", "home", "computer", "phone"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const TOOL: Anthropic.Tool = {
  name: "propose_tasks",
  description: "Return every actionable task found in the user's list or image.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative title, e.g. 'Get a haircut'." },
            description: { type: ["string", "null"], description: "Extra detail from the source, or null." },
            estimate_minutes: {
              type: ["integer", "null"],
              description: "Realistic minutes to do it, if reasonably guessable (sign up online ~15, haircut ~45). Null if unclear.",
            },
            importance: { type: "integer", minimum: 0, maximum: 5, description: "0-5. Default 3 unless the source signals otherwise." },
            urgency: { type: "integer", minimum: 0, maximum: 5, description: "0-5. Higher when there's a near deadline." },
            due_by: {
              type: ["string", "null"],
              description: "YYYY-MM-DD 'do by' date only if the source states or clearly implies one ('by Friday', 'this week'). Otherwise null.",
            },
            context: {
              type: ["string", "null"],
              enum: ["out", "home", "computer", "phone", null],
              description: "Where it gets done: out (errands, driving, appointments), home (chores), computer, phone (calls). Null if unclear.",
            },
            is_upkeep: {
              type: "boolean",
              description: "True for routine life maintenance (cleaning, haircut, car care, laundry, groceries).",
            },
          },
          required: ["title", "description", "estimate_minutes", "importance", "urgency", "due_by", "context", "is_upkeep"],
        },
      },
    },
    required: ["tasks"],
  },
};

function systemPrompt(today: string) {
  return [
    "You turn to-do lists into tasks for a personal task app.",
    `Today is ${today}. Resolve relative dates ("Friday", "next week", "this week" = the coming Sunday) to YYYY-MM-DD.`,
    "Include only actionable items. Split combined lines into separate tasks when they are clearly separate.",
    "Skip headings, crossed-out or checked-off items, and anything that is clearly not a task.",
    "Keep the user's wording where possible; fix obvious typos. Don't invent tasks or deadlines.",
    "If an image contains no tasks, return an empty list.",
  ].join("\n");
}

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;

function clean(raw: unknown): ImportedTask[] {
  const list = (raw as { tasks?: unknown[] })?.tasks;
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => {
      const t = r as Record<string, unknown>;
      const title = typeof t.title === "string" ? t.title.trim().slice(0, 200) : "";
      const due = typeof t.due_by === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_by) ? t.due_by : null;
      const ctx = CONTEXTS.includes(t.context as TaskContext) ? (t.context as TaskContext) : null;
      return {
        title,
        description: typeof t.description === "string" && t.description.trim() ? t.description.trim() : null,
        estimateMinutes:
          typeof t.estimate_minutes === "number" && t.estimate_minutes > 0 ? clampInt(t.estimate_minutes, 1, 24 * 60, 0) : null,
        importance: clampInt(t.importance, 0, 5, 3),
        urgency: clampInt(t.urgency, 0, 5, 3),
        dueBy: due,
        context: ctx,
        isUpkeep: t.is_upkeep === true,
      };
    })
    .filter((t) => t.title)
    .slice(0, 50);
}

export async function parseTasks(input: {
  text?: string;
  image?: { data: string; mediaType: string };
  today: string;
}): Promise<ImportedTask[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Smart import isn't set up yet — add ANTHROPIC_API_KEY to the app's environment variables.");
  }
  const text = input.text?.trim().slice(0, 20_000);
  if (!text && !input.image) throw new Error("Paste a list or add a photo first.");

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    if (!IMAGE_TYPES.includes(input.image.mediaType as ImageType)) {
      throw new Error("That image type isn't supported — use a JPEG, PNG, GIF or WebP.");
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType as ImageType, data: input.image.data },
    });
  }
  content.push({
    type: "text",
    text: text
      ? `Turn this into tasks:\n\n${text}`
      : "Turn the to-do items in this image into tasks.",
  });

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt(input.today),
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content }],
  });

  const call = res.content.find((b) => b.type === "tool_use");
  return call && call.type === "tool_use" ? clean(call.input) : [];
}

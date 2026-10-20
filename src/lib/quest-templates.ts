/** A ready-made quest: pick it in the quest creator and everything's filled in. */
export type QuestTemplate = {
  id: string;
  name: string;
  title: string;
  description?: string | null;
  boardId?: string | null;
  estimateMinutes?: number | null;
  xp?: number;
  importance?: number;
  urgency?: number;
  effort?: number;
  steps: string[];
};

export function normalizeTemplates(raw: unknown): QuestTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is QuestTemplate => !!t && typeof t === "object" && typeof (t as QuestTemplate).title === "string")
    .map((t) => ({
      id: String(t.id ?? "").slice(0, 40) || `t${Math.random().toString(36).slice(2, 10)}`,
      name: String(t.name || t.title).replace(/\s+/g, " ").trim().slice(0, 60),
      title: t.title.replace(/\s+/g, " ").trim().slice(0, 140),
      description: typeof t.description === "string" ? t.description.slice(0, 2000) : null,
      boardId: typeof t.boardId === "string" ? t.boardId : null,
      estimateMinutes: Number.isFinite(Number(t.estimateMinutes)) && Number(t.estimateMinutes) > 0 ? Math.round(Number(t.estimateMinutes)) : null,
      xp: Math.max(0, Math.round(Number(t.xp) || 0)),
      importance: Math.max(0, Math.min(5, Number(t.importance) || 0)),
      urgency: Math.max(0, Math.min(5, Number(t.urgency) || 0)),
      effort: Math.max(0, Math.min(5, Number(t.effort) || 0)),
      steps: (Array.isArray(t.steps) ? t.steps : []).map((s) => String(s).replace(/\s+/g, " ").trim().slice(0, 140)).filter(Boolean).slice(0, 30),
    }))
    .slice(0, 40);
}

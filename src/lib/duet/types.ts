export type Args = Record<string, unknown>;
export type Change = { kind: "quest" | "habit" | "board" | "quests" | "habits" | "boards" | "checkin"; id: string | null; before: unknown; after: unknown };
export type Out = { summary: string; data?: unknown; notes?: string[]; change?: Change };

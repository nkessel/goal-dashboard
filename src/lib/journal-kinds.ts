/** Kinds of journal entry (client-safe). */
export const JOURNAL_KINDS = [
  { key: "gratitude", label: "Gratitude", icon: "🙏", prompt: "What are you grateful for?" },
  { key: "expression", label: "Expression", icon: "💭", prompt: "What's on your mind? Let it out." },
  { key: "win", label: "Win", icon: "🏆", prompt: "What went well?" },
  { key: "idea", label: "Idea", icon: "💡", prompt: "What's the idea?" },
  { key: "feedback", label: "App feedback", icon: "🛠", prompt: "What would make this app better? (It goes into the next update.)" },
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number]["key"];

export function journalKindMeta(kind: string | null | undefined) {
  return JOURNAL_KINDS.find((k) => k.key === kind) ?? null;
}

/** Entries saved before the kind column existed carry it as a "[Label] " prefix. */
export function splitKindPrefix(body: string): { kind: JournalKind | null; body: string } {
  const m = /^\[([^\]]+)\] /.exec(body);
  const k = m ? JOURNAL_KINDS.find((x) => x.label === m[1]) : undefined;
  return k ? { kind: k.key, body: body.slice(m![0].length) } : { kind: null, body };
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addQuestToSharedBoardAction, takeOnSharedQuestAction } from "@/app/actions";

export type SharedBoardView = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  quests: { id: string; title: string; xp: number; addedBy: string | null }[];
};

/** Boards your party shares: add a quest to one, or take a quest on yourself. */
export function SharedBoards({ boards, viewerId, isAdventure }: { boards: SharedBoardView[]; viewerId: string; isAdventure: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!boards.length) return null;
  const card = `flex flex-col gap-2 rounded-2xl px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""}`;
  const cardStyle = isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  return (
    <section aria-label="Shared boards" className="flex flex-col gap-2">
      <h2 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-[16px] font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
        Shared boards
      </h2>
      {error && (
        <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {boards.map((b) => (
        <article key={b.id} className={card} style={cardStyle}>
          <div className="relative z-[1] flex items-baseline gap-2">
            <h3 dir="auto" className={`user-text m-0 min-w-0 flex-1 ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
              {b.title}
            </h3>
            <span className="shrink-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
              {b.ownerId === viewerId ? (
                "yours"
              ) : (
                <a href={`/friends/${b.ownerId}`} className="underline-offset-2 hover:underline" title={`See ${b.ownerName}'s screens`}>
                  {b.ownerName}&rsquo;s
                </a>
              )}
            </span>
          </div>
          <ul className="relative z-[1] m-0 flex list-none flex-col p-0">
            {b.quests.length === 0 && (
              <li className="text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
                Nothing open yet.
              </li>
            )}
            {b.quests.slice(0, 8).map((q) => (
              <li key={q.id} className="flex min-h-10 items-center gap-2 border-t py-1 first:border-t-0" style={{ borderColor: "rgba(139,112,64,.2)" }}>
                <span dir="auto" className="user-text min-w-0 flex-1 truncate text-[14.5px]" style={{ color: "var(--t-ink)" }}>
                  {q.title}
                  {q.addedBy && <span className="ml-1.5 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>· added by {q.addedBy}</span>}
                </span>
                <span className="shrink-0 text-[12.5px] font-bold" style={{ color: "var(--t-xp)" }}>
                  {q.xp} XP
                </span>
                {b.ownerId !== viewerId && (
                  <button
                    type="button"
                    disabled={pending || taken.has(q.id)}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await takeOnSharedQuestAction(q.id);
                          setTaken((t) => new Set(t).add(q.id));
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Couldn't take it on.");
                        }
                      })
                    }
                    className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold disabled:opacity-60"
                    style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
                    title="Add a copy to your own Additional Quests"
                  >
                    {taken.has(q.id) ? "✓ Taken on" : "Take it on too"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {adding === b.id ? (
            <form
              className="reveal relative z-[1] flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  try {
                    await addQuestToSharedBoardAction(b.id, text);
                    setText("");
                    setAdding(null);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't add it.");
                  }
                });
              }}
            >
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="A quest for this board" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[15px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)" }} />
              <button type="submit" disabled={pending || !text.trim()} className="h-10 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
                Add
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(b.id)} className="relative z-[1] self-start text-[13.5px] font-semibold underline underline-offset-2" style={{ color: "var(--t-ink)" }}>
              + Add a quest
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

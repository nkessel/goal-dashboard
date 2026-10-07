"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ImportItem } from "@/lib/data/rewards";
import { generateNextImportIconAction, listImportsAction } from "@/app/actions";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { RewardEditorDialog } from "@/components/rewards/RewardEditorDialog";

const itemId = (it: ImportItem) => (it.kind === "quest" ? it.task.id : it.reward.id);
const itemTitle = (it: ImportItem) => (it.kind === "quest" ? it.task.title : it.reward.title);
const itemIcon = (it: ImportItem) => (it.kind === "quest" ? it.task.icon_key : it.reward.icon_key);
const itemPending = (it: ImportItem) =>
  !itemIcon(it) && Boolean(it.kind === "quest" ? it.task.icon_prompt : it.reward.icon_prompt);

/**
 * Review imported quests and rewards one at a time. A list of every import
 * sits beside the editor; confirm (or edit, then confirm) each card, or save
 * the rest for later at any point. Portraits are painted in the background
 * as you go.
 */
export function ImportReview({ theme, onDone }: { theme: "calm" | "adventure"; onDone: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const painting = useRef(false);
  const isAdventure = theme === "adventure";

  useEffect(() => {
    listImportsAction()
      .then((list) => {
        setItems(list);
        setCurrentId(list[0] ? itemId(list[0]) : null);
      })
      .catch(() => setItems([]));
  }, []);

  // Paint missing portraits one at a time, updating the list as each lands.
  useEffect(() => {
    if (!items || painting.current || !items.some(itemPending)) return;
    painting.current = true;
    (async () => {
      for (let i = 0; i < 20; i++) {
        let r: Awaited<ReturnType<typeof generateNextImportIconAction>>;
        try {
          r = await generateNextImportIconAction();
        } catch {
          break;
        }
        if (r.done || !r.id) break;
        const { id, url } = r;
        setItems((prev) =>
          prev?.map((it) =>
            itemId(it) !== id
              ? it
              : it.kind === "quest"
                ? { ...it, task: { ...it.task, icon_key: url ?? null, icon_source: "ai" } }
                : { ...it, reward: { ...it.reward, icon_key: url ?? null } }
          ) ?? prev
        );
      }
      painting.current = false;
    })();
  }, [items]);

  function finish() {
    router.refresh();
    onDone();
  }

  function advance() {
    if (!items || !currentId) return;
    const nextConfirmed = new Set(confirmed).add(currentId);
    setConfirmed(nextConfirmed);
    const next = items.find((it) => !nextConfirmed.has(itemId(it)));
    if (next) setCurrentId(itemId(next));
    else {
      setCurrentId(null);
      setTimeout(finish, 900);
    }
  }

  function plotRemainingQuests() {
    if (!items) return;
    const ids = items.filter((it) => it.kind === "quest" && !confirmed.has(itemId(it))).map(itemId);
    if (!ids.length) return;
    router.refresh();
    onDone();
    window.location.assign(`/matrix?plot=${ids.join(",")}&review=1`);
  }

  if (!items) return null;
  const total = items.length;
  const current = items.find((it) => itemId(it) === currentId) ?? null;
  const index = current ? items.indexOf(current) + 1 : total;
  const remainingQuests = items.filter((it) => it.kind === "quest" && !confirmed.has(itemId(it))).length;
  const review = { index, total, onLater: finish };

  const list = (
    <nav
      aria-label="Imports to review"
      className="overlay-fade-in fixed z-[55] flex gap-1.5 overflow-auto rounded-2xl p-2 parchment shadow-2xl max-lg:inset-x-3 max-lg:top-3 max-lg:flex-row lg:left-4 lg:top-1/2 lg:max-h-[80vh] lg:w-60 lg:-translate-y-1/2 lg:flex-col"
      style={{
        background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
        border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        color: "var(--t-ink)",
      }}
    >
      <p className="px-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide max-lg:hidden" style={{ color: "var(--t-ink-soft)" }}>
        New imports · {confirmed.size}/{total} done
      </p>
      {items.map((it) => {
        const id = itemId(it);
        const isDone = confirmed.has(id);
        const isCurrent = id === currentId;
        const icon = itemIcon(it);
        return (
          <button
            key={id}
            type="button"
            onClick={() => !isDone && setCurrentId(id)}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] max-lg:max-w-[200px]"
            style={{
              background: isCurrent ? (isAdventure ? "rgba(209,161,60,.28)" : "var(--t-accent-soft)") : "transparent",
              opacity: isDone ? 0.55 : 1,
            }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
              style={{ border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, background: "rgba(255,255,255,.4)" }}
            >
              {isDone ? (
                <span style={{ color: "var(--t-xp)" }}>✓</span>
              ) : icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated portrait
                <img src={icon} alt="" className="h-full w-full object-cover" />
              ) : itemPending(it) ? (
                <span className="animate-pulse" title="Painting a portrait…">
                  ✎
                </span>
              ) : it.kind === "reward" ? (
                "🎁"
              ) : (
                "⚔"
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{itemTitle(it)}</span>
              <span className="block text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
                {it.kind === "quest" ? "Quest" : "Reward"}
                {isDone ? " · confirmed" : ""}
              </span>
            </span>
          </button>
        );
      })}
      {remainingQuests > 0 && (
        <button
          type="button"
          onClick={plotRemainingQuests}
          className="mt-1 shrink-0 rounded-xl px-2 py-2 text-left text-[12px] font-semibold underline max-lg:hidden"
          style={{ color: "var(--t-ink-soft)" }}
        >
          Plot {remainingQuests === 1 ? "the quest" : `all ${remainingQuests} quests`} on the Priority Matrix
        </button>
      )}
    </nav>
  );

  return (
    <>
      {createPortal(list, document.body)}
      {current?.kind === "quest" && (
        <QuestEditorDialog
          key={itemId(current)}
          mode={{ kind: "edit", task: current.task }}
          theme={theme}
          review={review}
          onSaved={advance}
          onPlot={plotRemainingQuests}
          onClose={finish}
        />
      )}
      {current?.kind === "reward" && (
        <RewardEditorDialog key={itemId(current)} reward={current.reward} theme={theme} review={review} onSaved={advance} onClose={finish} />
      )}
      {!current &&
        createPortal(
          <div className="overlay-fade-in fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }}>
            <div
              className="sheet-slide-up-in rounded-2xl px-6 py-5 text-center parchment shadow-2xl"
              style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: "2px solid var(--t-gold)", color: "var(--t-ink)" }}
            >
              <p className={isAdventure ? "font-display text-xl" : "text-xl font-bold"}>{total ? "All sorted! ✨" : "Nothing to review"}</p>
              <p className="mt-1 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                {total ? `${total} imports confirmed.` : "There are no new imports right now."}
              </p>
              {!total && (
                <button type="button" onClick={finish} className="mt-3 h-9 rounded-full px-4 text-sm font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  OK
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

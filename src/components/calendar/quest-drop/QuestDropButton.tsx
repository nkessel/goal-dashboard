"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Task } from "@/lib/data/types";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import type { DropQuest } from "@/lib/quest-drop";
import { QuestDropIcon } from "./QuestDropIcon";

const QuestDrop = dynamic(() => import("./QuestDrop").then((m) => m.QuestDrop), { ssr: false });

function toDrop(t: Task): DropQuest {
  const image = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
  const emoji = !image && t.icon_source === "monster" && t.icon_key ? (MONSTER_ICONS.find((m) => m.key === t.icon_key)?.emoji ?? null) : null;
  return { id: t.id, title: t.title, minutes: t.estimate_minutes, dueAt: t.due_at ?? null, planBy: t.plan_by ?? null, icon: image ?? emoji, iconIsImage: Boolean(image) };
}

/** The calendar's Quest Drop button: the scheduling list as a falling-blocks game (owner, Nov 18). */
export function QuestDropButton({ tasks, theme }: { tasks: Task[]; theme: "calm" | "adventure" }) {
  const [open, setOpen] = useState<DropQuest[] | null>(null);
  const isAdventure = theme === "adventure";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Quests already on the calendar ahead keep their time.
          const now = Date.now();
          setOpen(tasks.filter((t) => !(t.scheduled_start && Date.parse(t.scheduled_start) > now)).map(toDrop));
        }}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold"
        style={{ border: `1px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
        data-quest-drop-open
      >
        <span style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}>
          <QuestDropIcon size={16} />
        </span>
        Quest Drop
      </button>
      {open && <QuestDrop quests={open} theme={theme} onClose={() => setOpen(null)} />}
    </>
  );
}

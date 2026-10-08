"use client";

import { useState } from "react";
import { FabSpeedDial, type FabChoice } from "@/components/ui/FabSpeedDial";
import { RewardEditorDialog } from "@/components/rewards/RewardEditorDialog";
import { BoltIcon, DiamondIcon } from "@/components/ui/Icons";
import { QuestShield } from "@/components/ui/Ornaments";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import { Moon } from "@/components/evening/BeginEveningButton";
import { QuestEditorDialog } from "./QuestEditorDialog";

/**
 * "Add quest": the floating + button (top level) or a dashed "+ Add quest"
 * row inside a goal card. Both open the shared quest editor in create mode.
 */
export function AddTaskForm({
  goalId,
  theme = "calm",
  extraChoices = [],
}: {
  goalId?: string;
  theme?: "calm" | "adventure";
  /** More speed-dial options (e.g. "New rite" on the evening side). */
  extraChoices?: FabChoice[];
}) {
  const [open, setOpen] = useState<false | "quest" | "power">(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [riteOpen, setRiteOpen] = useState(false);
  const isAdventure = theme === "adventure";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";

  return (
    <>
      {goalId ? (
        <button
          type="button"
          onClick={() => setOpen("quest")}
          className="hover-glow w-full rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
          style={{ borderColor, color: dimText, opacity: isAdventure ? 0.85 : 1 }}
        >
          + Add {isAdventure ? "quest" : "task"}
        </button>
      ) : (
        !open &&
        !rewardOpen &&
        !riteOpen && (
          <FabSpeedDial
            theme={theme}
            label="Create something new"
            choices={[
              ...extraChoices,
              { key: "rite", label: "New evening rite", icon: <Moon size={20} />, onPick: () => setRiteOpen(true) },
              { key: "reward", label: "New reward", icon: <DiamondIcon size={20} />, onPick: () => setRewardOpen(true) },
              { key: "power", label: "New power-up", icon: <BoltIcon size={20} />, onPick: () => setOpen("power") },
              { key: "quest", label: isAdventure ? "New quest" : "New task", icon: <QuestShield size={20} />, onPick: () => setOpen("quest") },
            ]}
          />
        )
      )}
      {open && (
        <QuestEditorDialog
          mode={{ kind: "create", goalId, powerUp: open === "power" }}
          theme={theme}
          origin={goalId ? "center" : "fab"}
          onClose={() => setOpen(false)}
        />
      )}
      {rewardOpen && <RewardEditorDialog theme={theme} onClose={() => setRewardOpen(false)} />}
      {riteOpen && <RiteEditorDialog onClose={() => setRiteOpen(false)} />}
    </>
  );
}

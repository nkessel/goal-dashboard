"use client";

import { IconScale } from "../IconScale";
import { LevelScales, useScaleStyle, type ScaleItem } from "@/components/ui/LevelScales";
import type { EditorPart } from "@/lib/quest-editor-layout";

type ScaleKey = "importance" | "urgency" | "difficulty" | "energy";

/** The 0 to 5 scales (importance, urgency, difficulty, energy): rows of icons, or (by your choice) bars side by side. As bars, neighbouring scales in the layout stand together in one group, drawn where the first of them sits. The values stay with the dialog. */
export function EditorScale({ k, layout, values, setters }: { k: EditorPart; layout: { order: EditorPart[]; folded: EditorPart[] }; values: Record<ScaleKey, number>; setters: Record<ScaleKey, (n: number) => void> }) {
  const scaleStyle = useScaleStyle();
  const SCALES: Record<string, ScaleItem> = {
    importance: { key: "importance", label: "Importance", icon: "/design/ui-trophy.svg", value: values.importance, onChange: setters.importance },
    urgency: { key: "urgency", label: "Urgency", icon: "/design/ui-flame-sm.png", value: values.urgency, onChange: setters.urgency },
    difficulty: { key: "difficulty", label: "Difficulty", icon: "/design/ui-muscle.svg", hint: "How hard it is — how much it takes out of you", value: values.difficulty, onChange: setters.difficulty },
    energy: { key: "energy", label: "Energy boost", icon: "/design/ui-bolt.png", hint: "How much energy finishing it gives you", value: values.energy, onChange: setters.energy },
  };
  const run = (() => {
    if (scaleStyle !== "bars") return [k];
    const section = layout.folded.includes(k);
    const list = layout.order.filter((x) => layout.folded.includes(x) === section);
    const i = list.indexOf(k);
    if (i > 0 && SCALES[list[i - 1]]) return [];
    const out: EditorPart[] = [];
    for (let j = i; j < list.length && SCALES[list[j]]; j++) out.push(list[j]);
    return out;
  })();
  if (!run.length) return null;
  return <LevelScales items={run.map((x) => SCALES[x])} renderRow={(it) => <IconScale label={it.label} icon={it.icon} hint={it.hint} value={it.value} onChange={it.onChange} />} />;
}

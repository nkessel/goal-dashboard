"use client";

import { useLocalDay } from "@/components/evening/evening-clock";
import { useDawn } from "./useDawn";
import { DawnSettings } from "./DawnSettings";

/** Settings › Morning & evening routines: the same panel as the Dawn path's gear. */
export function DawnSettingsPanel() {
  const day = useLocalDay();
  const { dawn, saveSettings, error } = useDawn(day);
  if (!day || !dawn) return <p className="m-0 py-2 text-[13.5px] opacity-70">{error ?? "Loading…"}</p>;
  return (
    <div className="rounded-xl px-2.5 pb-1 pt-1" style={{ background: "#fffaf0", border: "1px solid #c9a24a" }}>
      <DawnSettings dawn={dawn} save={saveSettings} day={day} />
    </div>
  );
}

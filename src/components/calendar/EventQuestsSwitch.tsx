"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eventQuestsSettingAction, setEventQuestsAction } from "@/app/actions";

/**
 * Calendar gear › Display: upcoming events on the main Google calendar become quests by themselves
 * (owner, Nov 18: "make calendar events in the future (past ones are unaffected) into quests").
 */
export function EventQuestsSwitch() {
  const router = useRouter();
  const [on, setOn] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    eventQuestsSettingAction()
      .then((r) => live && setOn(r.on))
      .catch(() => live && setOn(false));
    return () => {
      live = false;
    };
  }, []);
  const pick = (v: boolean) =>
    start(async () => {
      const before = on;
      setOn(v);
      try {
        await setEventQuestsAction(v);
        router.refresh();
      } catch {
        setOn(before);
      }
    });
  const pill = (sel: boolean): React.CSSProperties =>
    sel ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" };
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5" data-event-quests>
      <span className="text-[13.5px]" style={{ color: "var(--t-ink)" }}>
        Calendar events as quests
      </span>
      <span role="group" aria-label="Calendar events as quests" className="flex flex-wrap gap-1">
        {([[false, "Off"], [true, "Upcoming ones"]] as const).map(([v, l]) => (
          <button key={l} type="button" aria-pressed={on === v} disabled={on === null || pending} onClick={() => pick(v)} className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold" style={pill(on === v)}>
            {l}
          </button>
        ))}
      </span>
      {on && (
        <span className="text-[11.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          Events on your main calendar from now on become quests (15 XP, 1 coin) with their time kept. Past ones stay as they are.
        </span>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { quickPlanDays } from "@/lib/schedule-horizon";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const planOptions = () => quickPlanDays(new Date());
// Short words for a list row, so the picks fit on one line.
const SHORT: Record<string, string> = { "This week": "This wk", "Within 2 weeks": "2 wks", "1 month": "1 mo" };
/** "This week", "1 month", or "Within 45 days". */
export const withinLabel = (days: number) => planOptions().find((o) => o.days === days)?.label ?? (days === 0 ? "Today" : `Within ${days} days`);
const ratedLabel = withinLabel;
const fieldStyle: React.CSSProperties = { borderColor: "rgba(139,112,64,.45)", background: "rgba(255,250,238,.6)" };

/**
 * "Schedule within": how soon it needs a time, one tap on the card or its list row (owner, Nov 6),
 * so every item lands in the auto-scheduler's right group. Other… takes days or a date, in place.
 * Same pills as the quest editor's (`.qe-fact`); tapping a lit one again clears it.
 */
export function ScheduleWithin({ days, onRate, small = false }: { days: number | null | undefined; onRate: (days: number | null) => void; small?: boolean }) {
  const [custom, setCustom] = useState(false);
  const [typed, setTyped] = useState("");
  const opts = planOptions();
  const isCustom = typeof days === "number" && !opts.some((o) => o.days === days);
  const cls = `qe-fact flex items-center whitespace-nowrap rounded-full font-semibold ${small ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[12.5px]"}`;
  const commit = () => {
    if (!(Number(typed) > 0)) return;
    onRate(Number(typed));
    setCustom(false);
    setTyped("");
  };
  const setDate = (k: string) => {
    if (!k) return;
    const n = Math.round((new Date(`${k}T12:00`).getTime() - new Date(`${inDays(0)}T12:00`).getTime()) / 86_400_000);
    if (n < 0) return;
    onRate(n);
    setCustom(false);
  };
  return (
    <div className="flex flex-col gap-1.5" data-sched-rate>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${small ? "text-[12px]" : "text-[12.5px]"} font-semibold`} style={{ color: "#6b5631" }}>
          {small ? "Within" : "Schedule within"}
        </span>
        {opts.map((o) => (
          <button key={o.label} type="button" aria-label={o.label} aria-pressed={days === o.days} onClick={() => onRate(days === o.days ? null : o.days)} className={cls} data-open={days === o.days ? "true" : undefined}>
            {small ? SHORT[o.label] ?? o.label : o.label}
          </button>
        ))}
        <button type="button" aria-expanded={custom} aria-pressed={isCustom} onClick={() => (isCustom && !custom ? onRate(null) : setCustom((v) => !v))} className={cls} data-open={isCustom || custom ? "true" : undefined}>
          {isCustom ? ratedLabel(days!) : "Other…"}
        </button>
      </div>
      <div className="drawer-body" data-open={custom || undefined}>
        <div className="drawer-inner">
          <div className="qe-fact-panel flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
            Within
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
              }}
              onBlur={commit}
              inputMode="numeric"
              placeholder="45"
              aria-label="Days"
              style={{ background: "transparent", boxShadow: "none", borderBottom: "1px solid #c8a24a" }}
              className="bare-input h-7 w-12 border-0 bg-transparent text-center text-[16px] tabular-nums focus:outline-none"
            />
            days
            <span style={{ color: "var(--t-ink-soft)" }}>or by</span>
            <DateField value="" min={inDays(0)} onChange={setDate} ariaLabel="Schedule by date" placeholder="a date" className="h-8 rounded-lg border px-2 text-[13.5px]" style={fieldStyle} />
          </div>
        </div>
      </div>
    </div>
  );
}

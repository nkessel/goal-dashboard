"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCheckMetricsAction, quickCheckInAction } from "@/app/actions";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const TAG = /(^|\s)#([\p{L}\p{N}_-]{1,24})(?=\s|$)/gu;

/**
 * A check-in from the + button. Every part is optional: tap a metric to
 * include it (Energy, Mood, …), and/or write an event or #tags. Only what's
 * switched on is saved.
 */
export function QuickCheckIn({ isAdventure, onDone }: { isAdventure: boolean; onDone: () => void }) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<string[]>(["Energy"]);
  const [on, setOn] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    getCheckMetricsAction()
      .then((m) => setMetrics(["Energy", ...m.filter((x) => x.toLowerCase() !== "energy")]))
      .catch(() => {});
  }, []);

  function type(v: string) {
    const m = v.match(/(^|\s)#([\p{L}\p{N}_-]{1,24})\s$/u);
    if (m) {
      const t = m[2].toLowerCase();
      setTags((x) => (x.includes(t) ? x : [...x, t]));
      setText(v.slice(0, v.length - m[0].length + m[1].length));
      return;
    }
    setText(v);
  }
  const toggle = (m: string) =>
    setOn((o) => {
      const x = { ...o };
      if (m in x) delete x[m];
      else x[m] = 6;
      return x;
    });

  const all = [...tags];
  const words = text
    .replace(TAG, (_, sp: string, t: string) => {
      if (!all.includes(t.toLowerCase())) all.push(t.toLowerCase());
      return sp;
    })
    .replace(/\s+/g, " ")
    .trim();
  const empty = Object.keys(on).length === 0 && !words && all.length === 0;

  function submit() {
    if (empty) return;
    setError(null);
    const energy = "Energy" in on ? on.Energy : null;
    const rest = Object.entries(on)
      .filter(([m]) => m !== "Energy")
      .map(([metric, level]) => ({ metric, level: Number(level) }));
    const notes = [...(words ? [words] : []), ...all.map((t) => `#${t}`)];
    start(async () => {
      try {
        await quickCheckInAction({ energy, metrics: rest, notes });
        setSaved(true);
        router.refresh();
        setTimeout(onDone, 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't check in.");
      }
    });
  }

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = { background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", border: `1.5px solid ${isAdventure ? "#8a6116" : "transparent"}` };

  if (saved)
    return (
      <p className="fade-in m-0 px-4 py-8 text-center text-[17px] font-semibold" style={{ color: ink }}>
        ✓ Checked in
      </p>
    );

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      <p className="m-0 text-[13.5px]" style={{ color: soft }}>
        Everything is optional — tap what you want to log.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to include">
        {metrics.map((m) => (
          <button key={m} type="button" aria-pressed={m in on} onClick={() => toggle(m)} className="h-9 rounded-full px-3.5 text-[14px] font-semibold" style={m in on ? gold : { border: "1.5px dashed rgba(139,112,64,.5)", color: ink }}>
            {m in on ? "✓ " : "+ "}
            {m}
          </button>
        ))}
      </div>
      {Object.keys(on).length > 0 && (
        <div className="reveal flex flex-col gap-2">
          {metrics
            .filter((m) => m in on)
            .map((m) => {
              const v = on[m];
              const hue = Math.round(((v - 1) / 9) * 110);
              return (
                <label key={m} className="flex items-center gap-2.5">
                  <span className="w-[78px] shrink-0 truncate text-[14.5px] font-semibold" style={{ color: ink }}>
                    {m}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={v}
                    onChange={(e) => setOn((o) => ({ ...o, [m]: Math.round(Number(e.target.value) * 10) / 10 }))}
                    aria-label={`${m}, 1 to 10`}
                    className="energy-range min-w-0 flex-1"
                    style={{ "--energy-pct": `${((v - 1) / 9) * 100}%`, "--energy-color": m === "Energy" ? `hsl(${hue} 60% 48%)` : "#c9a24a" } as React.CSSProperties}
                  />
                  <span className="w-9 shrink-0 text-right font-display text-[18px] tabular-nums" style={{ color: ink }}>
                    {fmt(v)}
                  </span>
                </label>
              );
            })}
        </div>
      )}
      <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1" style={{ background: "rgba(255,255,255,.55)", borderColor: "#b39a6a" }}>
        {tags.map((t) => (
          <span key={t} className="flex h-6 items-center gap-0.5 rounded-full pl-2 pr-0.5 text-[13px] font-semibold" style={{ background: "#e9d49a", border: "1px solid #8a6116", color: "#2a1c10" }}>
            #{t}
            <button type="button" onClick={() => setTags((x) => x.filter((y) => y !== t))} aria-label={`Remove #${t}`} className="flex h-5 w-5 items-center justify-center rounded-full text-[13px] leading-none hover:bg-black/10">
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Backspace" && !text && tags.length) setTags((t) => t.slice(0, -1));
          }}
          maxLength={200}
          placeholder={tags.length ? "more #tags, or what happened" : "Event or #tags (optional)"}
          aria-label="Event or #tags"
          className="bare-input h-8 min-w-[140px] flex-1 bg-transparent px-1 text-[15.5px] focus:outline-none"
          style={{ color: ink }}
        />
      </div>
      {error && (
        <p className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <button type="button" data-submit onClick={submit} disabled={pending || empty} className="hover-glow h-11 rounded-full text-[15px] font-bold disabled:opacity-50" style={gold}>
        {pending ? "Checking in…" : "Check in"}
      </button>
    </div>
  );
}

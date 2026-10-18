"use client";

import { useRef, useState, useTransition } from "react";
import { processSeedsAction, saveLifeWheelAction } from "@/app/actions";

export type Focus = { area: string; from: number | null; target: number; quests: { id: string; title: string }[] };
type Quest = { id: string; title: string; board: string | null };

const INK = "#3b2a14";
const SOFT = "#6b5631";
const GOLD = "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)";

/**
 * Choose life-wheel areas to lift, where each is now, where you'd like it by
 * the end of the week or month, and the quests that will get it there.
 */
export function FocusPlanner({
  kind,
  topics,
  last,
  focus,
  onChange,
  open,
  max = 3,
}: {
  kind: "week" | "month";
  topics: string[];
  last: Record<string, { level: number; at: string }>;
  focus: Focus[];
  onChange: (f: Focus[]) => void;
  open: Quest[];
  max?: number;
}) {
  const chosen = new Set(focus.map((f) => f.area));
  const toggle = (area: string) => {
    if (chosen.has(area)) return onChange(focus.filter((f) => f.area !== area));
    if (focus.length >= max) return;
    const from = last[area]?.level ?? null;
    onChange([...focus, { area, from, target: Math.min(10, Math.round(from ?? 5) + 1), quests: [] }]);
  };
  const patch = (area: string, p: Partial<Focus>) => onChange(focus.map((f) => (f.area === area ? { ...f, ...p } : f)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Life areas">
        {topics.map((t) => {
          const on = chosen.has(t);
          const lvl = last[t]?.level;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              disabled={!on && focus.length >= max}
              onClick={() => toggle(t)}
              className="h-9 rounded-full px-3 text-[14px] font-semibold disabled:opacity-45"
              style={on ? { background: GOLD, border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1px solid #a58c66", color: INK }}
            >
              {t}
              {lvl !== undefined && <span className="ml-1 text-[12px] opacity-70">{fmt(lvl)}</span>}
            </button>
          );
        })}
      </div>
      {focus.length === 0 && (
        <p className="m-0 text-[14px] italic" style={{ color: SOFT }}>
          {kind === "week" ? "Pick one area to lift this week (or two, if you're feeling bold)." : `Pick up to ${max} areas.`}
        </p>
      )}
      {focus.map((f) => (
        <div key={f.area} className="reveal flex flex-col gap-2.5 rounded-xl px-3 py-3" style={{ background: "rgba(255,250,235,.6)", border: "1px solid rgba(139,112,64,.35)" }}>
          <div className="flex items-baseline gap-2">
            <h3 className="font-display m-0 flex-1 text-[20px]" style={{ color: INK }}>
              {f.area}
            </h3>
            <span className="text-[14px] tabular-nums" style={{ color: SOFT }}>
              {f.from === null ? "not rated yet" : `now ${fmt(f.from)}`} → <b style={{ color: "#8a6116" }}>aim for {fmt(f.target)}</b>
            </span>
          </div>
          <RatingTrack
            area={f.area}
            from={f.from}
            target={f.target}
            onChange={(from, target) => patch(f.area, { from, target })}
          />
          <p className="m-0 text-[12.5px]" style={{ color: SOFT }}>
            Drag the ring to where it is now, and the star to where you want it by the end of the {kind}.
          </p>
          <FocusQuests quests={f.quests} open={open} onChange={(quests) => patch(f.area, { quests })} area={f.area} />
        </div>
      ))}
    </div>
  );
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** A 1–10 track with two handles: a ring for now, a gold star for the aim. */
function RatingTrack({ area, from, target, onChange }: { area: string; from: number | null; target: number; onChange: (from: number | null, target: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<"from" | "target" | null>(null);
  const pct = (v: number) => `${((v - 1) / 9) * 100}%`;
  const valueAt = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(1, Math.min(10, Math.round(1 + ((x - r.left) / r.width) * 9)));
  };
  const move = (which: "from" | "target", v: number) => (which === "from" ? onChange(v, target) : onChange(from, v));
  const key = (which: "from" | "target", v: number) => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    move(which, Math.max(1, Math.min(10, Math.round(v) + d)));
  };
  const lo = Math.min(from ?? target, target);
  const hi = Math.max(from ?? target, target);
  return (
    <div className="px-3 pb-5 pt-3">
      <div
        ref={track}
        className="relative h-2 touch-none rounded-full"
        style={{ background: "rgba(110,85,40,.18)" }}
        onPointerDown={(e) => {
          const v = valueAt(e.clientX);
          // Grab whichever handle is nearer; a tie goes to the star.
          grab.current = from !== null && Math.abs(v - from) < Math.abs(v - target) ? "from" : "target";
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(grab.current, v);
        }}
        onPointerMove={(e) => grab.current && move(grab.current, valueAt(e.clientX))}
        onPointerUp={() => (grab.current = null)}
        onPointerCancel={() => (grab.current = null)}
      >
        {from !== null && (
          <span
            className="absolute top-0 h-2 rounded-full"
            style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})`, background: target >= (from ?? 0) ? "linear-gradient(90deg, rgba(168,138,63,.45), #d9b45f)" : "rgba(160,70,60,.45)" }}
          />
        )}
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} aria-hidden className="absolute top-4 -translate-x-1/2 text-[11px] tabular-nums" style={{ left: pct(i + 1), color: SOFT }}>
            {i + 1}
          </span>
        ))}
        {from !== null && (
          <span
            role="slider"
            tabIndex={0}
            aria-label={`${area} now`}
            aria-valuemin={1}
            aria-valuemax={10}
            aria-valuenow={from}
            onKeyDown={key("from", from)}
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: pct(from), background: "#fffaf0", border: `3px solid ${INK}`, boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}
          />
        )}
        <span
          role="slider"
          tabIndex={0}
          aria-label={`${area} aim`}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={target}
          onKeyDown={key("target", target)}
          className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: pct(target), filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="#e3bf5c" stroke="#4a3913" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {from === null && (
        <button type="button" onClick={() => onChange(Math.max(1, target - 1), target)} className="mt-6 text-[12.5px] underline underline-offset-2" style={{ color: SOFT }}>
          Add where it is now
        </button>
      )}
    </div>
  );
}

/** Pick existing quests, or write a new one, that will move this area. */
function FocusQuests({ quests, open, onChange, area }: { quests: { id: string; title: string }[]; open: Quest[]; onChange: (q: { id: string; title: string }[]) => void; area: string }) {
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const have = new Set(quests.map((x) => x.id));
  const needle = q.trim().toLowerCase();
  const matches = needle ? open.filter((o) => !have.has(o.id) && (o.title.toLowerCase().includes(needle) || (o.board ?? "").toLowerCase().includes(needle))).slice(0, 6) : [];
  function create() {
    const text = q.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      try {
        const made = await processSeedsAction([{ text, fate: "quest" }]);
        if (made[0]) onChange([...quests, { id: made[0].id, title: made[0].text }]);
        setQ("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't make that quest.");
      }
    });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-[12.5px] font-bold uppercase tracking-[.12em]" style={{ color: SOFT }}>
        Quests that will get it there
      </p>
      {quests.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {quests.map((x) => (
            <li key={x.id} className="flex min-h-9 items-center gap-2 rounded-lg pl-2.5 pr-1" style={{ background: "rgba(217,180,95,.22)", border: "1px solid rgba(139,112,64,.4)" }}>
              <span aria-hidden style={{ color: "#8a6116" }}>⚔</span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold" style={{ color: INK }}>
                {x.title}
              </span>
              <button type="button" onClick={() => onChange(quests.filter((y) => y.id !== x.id))} aria-label={`Remove “${x.title}”`} className="flex h-8 w-8 items-center justify-center rounded-full text-[17px] hover:bg-black/10" style={{ color: SOFT }}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0] && matches[0].title.toLowerCase() === needle) {
                onChange([...quests, { id: matches[0].id, title: matches[0].title }]);
                setQ("");
              } else create();
            }
          }}
          placeholder={quests.length ? "Add another…" : `Find a quest, or write a new one for ${area}`}
          aria-label={`Add a quest for ${area}`}
          maxLength={140}
          className="h-10 w-full rounded-lg border px-3 text-[15px]"
          style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: INK }}
        />
        {needle && (
          <ul className="absolute inset-x-0 top-11 z-10 m-0 flex list-none flex-col overflow-hidden rounded-xl p-1" style={{ background: "#fbf3df", border: "1px solid #a58c66", boxShadow: "0 10px 24px rgba(0,0,0,.25)" }}>
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...quests, { id: m.id, title: m.title }]);
                    setQ("");
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[14.5px] hover:bg-black/[.06]"
                  style={{ color: INK }}
                >
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.board && <span className="shrink-0 text-[12px]" style={{ color: SOFT }}>{m.board}</span>}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={create} disabled={busy} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[14.5px] font-semibold hover:bg-black/[.06] disabled:opacity-60" style={{ color: "#8a6116" }}>
                + {busy ? "Making…" : `New quest: “${q.trim()}”`}
              </button>
            </li>
          </ul>
        )}
      </div>
      {error && (
        <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Last week's (or month's) focus: did the area move, and which quests got done? */
export function FocusFollowUp({
  kind,
  items,
  last,
}: {
  kind: "week" | "month";
  items: (Omit<Focus, "quests"> & { quests: { id: string; title: string; done: boolean }[] })[];
  last: Record<string, { level: number; at: string }>;
}) {
  const [now, setNow] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13px] font-bold uppercase tracking-[.12em]" style={{ color: SOFT }}>
        Last {kind}&apos;s focus
      </p>
      {items.map((f) => {
        const current = now[f.area] ?? null;
        const doneN = f.quests.filter((q) => q.done).length;
        const hit = current !== null && current >= f.target;
        return (
          <div key={f.area} className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: hit ? "rgba(217,180,95,.28)" : "rgba(255,250,235,.6)", border: "1px solid rgba(139,112,64,.35)" }}>
            <div className="flex items-baseline gap-2">
              <span className="font-display flex-1 text-[18px]" style={{ color: INK }}>
                {f.area}
              </span>
              <span className="text-[13px] tabular-nums" style={{ color: SOFT }}>
                {f.from !== null ? `was ${fmt(f.from)}, ` : ""}aimed for {fmt(f.target)}
              </span>
            </div>
            {f.quests.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {f.quests.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 text-[14px]" style={{ color: INK, opacity: q.done ? 1 : 0.75 }}>
                    <span aria-hidden style={{ color: q.done ? "#5a8a3a" : SOFT }}>{q.done ? "✓" : "○"}</span>
                    <span className="min-w-0 flex-1 truncate">{q.title}</span>
                  </li>
                ))}
                <li className="text-[12.5px]" style={{ color: SOFT }}>
                  {doneN} of {f.quests.length} done
                </li>
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${f.area} now`}>
              <span className="mr-1 text-[13.5px] font-semibold" style={{ color: INK }}>
                Where is it now?
              </span>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={current === v}
                  onClick={() => {
                    setNow((n) => ({ ...n, [f.area]: v }));
                    setSaved((s) => ({ ...s, [f.area]: false }));
                    start(async () => {
                      await saveLifeWheelAction([{ topic: f.area, level: v }]).catch(() => null);
                      setSaved((s) => ({ ...s, [f.area]: true }));
                    });
                  }}
                  className="h-8 w-8 rounded-full text-[13.5px] font-semibold tabular-nums"
                  style={
                    current === v
                      ? { background: GOLD, border: "1.5px solid #4a3913", color: "#2a1c10" }
                      : { border: `1px solid ${v === f.target ? "#8a6116" : "rgba(139,112,64,.4)"}`, color: INK, background: last[f.area]?.level === v ? "rgba(110,85,40,.1)" : undefined }
                  }
                >
                  {v}
                </button>
              ))}
            </div>
            {current !== null && (
              <p className="m-0 text-[13.5px] font-semibold" style={{ color: hit ? "#6d4f0c" : SOFT }}>
                {hit
                  ? "🎯 You reached it."
                  : f.from !== null && current > f.from
                    ? `Up ${fmt(current - f.from)}: moving the right way.`
                    : "Not there yet. Worth carrying into this " + kind + "?"}
                {saved[f.area] && <span className="ml-1.5 font-normal opacity-70">· saved to your life wheel</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

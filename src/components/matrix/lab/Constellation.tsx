"use client";

import { useRef, useState } from "react";
import { hash01, type Scored } from "@/lib/priority";
import { QuestTip, type LabTask } from "./shared";

const SIZE = 400;
const C = SIZE / 2;
const R = 176;
const NIGHT = "#141a3a";

/**
 * A star chart of your quests. The nearer the center, the more it deserves
 * your attention by the weights you've set. Each board is a constellation
 * around the circle; a star's size is the time it takes, its brightness its
 * urgency, and a dashed red halo means it keeps getting rescheduled.
 */
export function Constellation<T extends LabTask>({
  scored,
  boards,
  onOpen,
}: {
  scored: Scored<T>[];
  boards: { id: string; title: string }[];
  onOpen: (t: T) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ s: Scored<T>; x: number; y: number; w: number; h: number } | null>(null);

  const top = scored[0]?.score || 1;
  const groups = [...new Set(scored.map((s) => s.task.board_id ?? "none"))];
  const title = (id: string) => (id === "none" ? "No board" : (boards.find((b) => b.id === id)?.title ?? "Board"));
  const sector = (Math.PI * 2) / Math.max(1, groups.length);

  const stars = scored.map((s, i) => {
    const g = groups.indexOf(s.task.board_id ?? "none");
    const angle = -Math.PI / 2 + g * sector + (0.12 + hash01(s.task.id) * 0.76) * sector;
    const r = 18 + (1 - s.score / top) * (R - 30);
    const minutes = s.task.estimate_minutes;
    return {
      s,
      rank: i,
      x: C + Math.cos(angle) * r,
      y: C + Math.sin(angle) * r,
      size: minutes == null ? 5 : Math.min(12, 4 + Math.sqrt(minutes / 15) * 2.4),
      glow: 0.5 + 0.5 * s.values.urgency,
      stuck: (s.task.reschedule_count ?? 0) >= 3,
    };
  });

  function show(e: React.PointerEvent | React.FocusEvent, star: (typeof stars)[number]) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ s: star.s, x: (star.x / SIZE) * box.width, y: (star.y / SIZE) * box.height, w: box.width, h: box.height });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrap}
        className="relative mx-auto aspect-square w-full max-w-[560px] overflow-visible rounded-full"
        style={{ background: `radial-gradient(circle at 50% 50%, #26306a 0%, ${NIGHT} 62%, #0b0e24 100%)`, boxShadow: "0 0 0 2px rgba(217,180,95,.45), 0 10px 30px rgba(0,0,0,.45)" }}
        onClick={() => setTip(null)}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Constellation of your quests: nearer the center means more important right now">
          {/* Recessive rings: now, soon, later. */}
          {[0.33, 0.66, 1].map((k) => (
            <circle key={k} cx={C} cy={C} r={18 + k * (R - 30)} fill="none" stroke="rgba(220,226,255,.12)" strokeWidth="1" strokeDasharray={k === 1 ? undefined : "2 5"} />
          ))}
          {/* Sector lines and constellation names. */}
          {groups.map((g, i) => {
            const a = -Math.PI / 2 + i * sector;
            const mid = a + sector / 2;
            return (
              <g key={g}>
                {groups.length > 1 && <line x1={C} y1={C} x2={C + Math.cos(a) * R} y2={C + Math.sin(a) * R} stroke="rgba(220,226,255,.08)" strokeWidth="1" />}
                <text x={C + Math.cos(mid) * (R + 2)} y={C + Math.sin(mid) * (R + 2)} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="rgba(242,210,126,.8)" style={{ fontFamily: "var(--font-cinzel), serif" }}>
                  {title(g).length > 16 ? `${title(g).slice(0, 15)}…` : title(g)}
                </text>
              </g>
            );
          })}
          {/* The center: what's next. */}
          <circle cx={C} cy={C} r={14} fill="rgba(242,210,126,.12)" stroke="rgba(242,210,126,.5)" strokeWidth="1" />
          <text x={C} y={C + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="rgba(242,210,126,.9)">
            Next
          </text>

          {stars.map((st) => (
            <g
              key={st.s.task.id}
              tabIndex={0}
              role="button"
              aria-label={`${st.s.task.title}, priority ${Math.round(st.s.score * 100)}`}
              style={{ cursor: "pointer", outline: "none" }}
              onPointerEnter={(e) => e.pointerType === "mouse" && show(e, st)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
              onFocus={(e) => show(e, st)}
              onClick={(e) => {
                e.stopPropagation();
                if (tip?.s.task.id === st.s.task.id) onOpen(st.s.task);
                else show(e as unknown as React.PointerEvent, st);
              }}
              onKeyDown={(e) => e.key === "Enter" && onOpen(st.s.task)}
            >
              <circle cx={st.x} cy={st.y} r={st.size + 9} fill="transparent" />
              <circle cx={st.x} cy={st.y} r={st.size * 2.2} fill={`rgba(242,210,126,${0.12 * st.glow})`} />
              {st.stuck && <circle cx={st.x} cy={st.y} r={st.size + 4} fill="none" stroke="#e34948" strokeWidth="1.5" strokeDasharray="2 2" />}
              <circle cx={st.x} cy={st.y} r={st.size} fill="#f2d27e" fillOpacity={st.glow} stroke={NIGHT} strokeWidth="2" />
              {st.rank < 5 && (
                <text x={st.x + st.size + 5} y={st.y} dominantBaseline="middle" fontSize="11" fill="#f1ead2" style={{ pointerEvents: "none" }}>
                  {st.s.task.title.length > 20 ? `${st.s.task.title.slice(0, 19)}…` : st.s.task.title}
                </text>
              )}
            </g>
          ))}
        </svg>
        {tip && <QuestTip s={tip.s} x={tip.x} y={tip.y} bounds={{ w: tip.w, h: tip.h }} onOpen={() => onOpen(tip.s.task)} />}
      </div>
      <p className="m-0 text-center text-[13px]" style={{ color: "var(--t-cream, var(--t-ink-soft))", opacity: 0.85 }}>
        Nearer the center: more deserving of you now · bigger: takes longer · brighter: more urgent · dashed red: keeps slipping
      </p>
    </div>
  );
}

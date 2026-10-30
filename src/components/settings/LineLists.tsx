"use client";

import { useState } from "react";
import { ROTATION, likeLine, likedLines, retireLine, retiredLines, rotationFor } from "@/lib/greetings";

/**
 * The wise lines in rotation: like one to see it more, × to delete it (the
 * next line waiting takes its place). Deleted lines can be brought back.
 */
export function WiseLines({ own }: { own: string[] }) {
  const [open, setOpen] = useState(false);
  // Re-read after each change (the lists live in this browser).
  const [, setTick] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const { liked, fresh } = open ? rotationFor(today, own) : { liked: [], fresh: [] };
  const gone = open ? [...retiredLines()] : [];
  const likedSet = open ? likedLines() : new Set<string>();
  const bump = () => setTick((t) => t + 1);
  const row = (l: string) => (
    <li key={l} className="flex min-h-9 items-start gap-1.5 rounded-lg px-1.5 py-1 text-[14px] leading-snug hover:bg-black/[.04]">
      <span className="min-w-0 flex-1 pt-1">{l}</span>
      <button type="button" onClick={() => (likeLine(l, !likedSet.has(l)), bump())} aria-pressed={likedSet.has(l)} aria-label={likedSet.has(l) ? `Unlike “${l}”` : `Like “${l}”: show it more`} title={likedSet.has(l) ? "Liked: shows often" : "Like: show it more"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px]" style={{ color: likedSet.has(l) ? "#b0402c" : "var(--t-ink-soft)" }}>
        {likedSet.has(l) ? "♥" : "♡"}
      </button>
      <button type="button" onClick={() => (retireLine(l, true), bump())} aria-label={`Delete “${l}”`} title="Delete: another line takes its place" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px]" style={{ color: "var(--t-ink-soft)" }}>
        ×
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="hover-glow flex h-9 items-center gap-1.5 self-start rounded-full px-3.5 text-[13px] font-semibold" style={{ border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}>
        The wise lines in rotation <span style={{ color: "var(--t-ink-soft)" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="reveal flex flex-col gap-1 rounded-xl p-1.5" style={{ border: "1px solid var(--t-card-border)" }}>
          <p className="m-0 px-1.5 text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
            {ROTATION} lines take turns, and a few new ones join each week. ♡ brings one back often; × deletes it and the next one waiting takes its place.
          </p>
          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-0.5 overflow-y-auto p-0">
            {liked.map(row)}
            {fresh.filter((l) => !liked.includes(l)).map(row)}
          </ul>
          {gone.length > 0 && (
            <details className="px-1.5 text-[13px]">
              <summary className="cursor-pointer py-1" style={{ color: "var(--t-ink-soft)" }}>
                Deleted ({gone.length})
              </summary>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {gone.map((l) => (
                  <li key={l} className="flex min-h-9 items-center gap-2">
                    <span className="min-w-0 flex-1 line-through opacity-60">{l}</span>
                    <button type="button" onClick={() => (retireLine(l, false), bump())} className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] underline underline-offset-2">
                      Bring back
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function PhraseList({ title, lines, isOn, onToggle, retired = false }: { title: string; lines: string[]; isOn?: (line: string) => boolean; onToggle?: (line: string, on: boolean) => void; retired?: boolean }) {
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const on = (l: string) => (retired ? !off.has(l) : isOn!(l));
  const toggle = (l: string) => {
    const next = !on(l);
    if (retired) {
      retireLine(l, !next);
      setOff(retiredLines());
    } else onToggle!(l, next);
  };
  const count = lines.filter(on).length;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => (setOpen((v) => !v), retired && setOff(retiredLines()))}
        aria-expanded={open}
        className="hover-glow flex h-9 items-center gap-1.5 self-start rounded-full px-3.5 text-[13px] font-semibold"
        style={{ border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        {title} <span style={{ color: "var(--t-ink-soft)" }}>{open ? "▾" : `▸ ${count} of ${lines.length} on`}</span>
      </button>
      {open && (
        <ul className="reveal m-0 flex max-h-[320px] list-none flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5" style={{ border: "1px solid var(--t-card-border)" }}>
          {lines.map((l) => (
            <li key={l}>
              <label className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-[14px] leading-snug hover:bg-black/[.04]" style={{ opacity: on(l) ? 1 : 0.6 }}>
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--t-gold-deep)]" checked={on(l)} onChange={() => toggle(l)} />
                <span className={on(l) ? "" : "line-through"}>{l}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

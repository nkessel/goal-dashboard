"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCheckNoteAction, deleteCheckNoteAction } from "@/app/actions";

type Note = { id: string; body: string; created_at: string };
type When = "now" | "morning" | "yesterday" | "pick";

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Log something that happened — any time, not just with a check-in:
 * "Missed my medication", "Slept badly #sleep". #tags become pills as you
 * type. Pick when it happened: now, this morning, yesterday, or any moment.
 * The last few show below, each removable.
 */
export function EventLog({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [when, setWhen] = useState<When>("now");
  const [pickDate, setPickDate] = useState(() => localInput(new Date()).slice(0, 10));
  const [pickTime, setPickTime] = useState(() => localInput(new Date()).slice(11, 16));
  const [allDay, setAllDay] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Tapping a day on the chart opens this, set to that day.
  useEffect(() => {
    const h = (e: Event) => {
      const date = (e as CustomEvent<{ date: string }>).detail?.date;
      if (!date) return;
      setOpen(true);
      setWhen("pick");
      setPickDate(date);
      setAllDay(false);
      setTimeout(() => boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    };
    window.addEventListener("insights-add-event", h);
    return () => window.removeEventListener("insights-add-event", h);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

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
  function atISO(): string | null {
    const d = new Date();
    if (allDay) {
      // All day: stamped at noon on that day.
      if (when === "yesterday") d.setDate(d.getDate() - 1);
      if (when === "pick") {
        const t = new Date(`${pickDate}T12:00`);
        return Number.isFinite(t.getTime()) ? t.toISOString() : null;
      }
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    }
    if (when === "now") return null;
    if (when === "morning") {
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    }
    if (when === "yesterday") {
      d.setDate(d.getDate() - 1);
      return d.toISOString();
    }
    const t = new Date(`${pickDate}T${pickTime || "12:00"}`);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
  }
  function save() {
    const all = [...tags];
    const words = text
      .replace(/(^|\s)#([\p{L}\p{N}_-]{1,24})(?=\s|$)/gu, (_, sp: string, t: string) => {
        if (!all.includes(t.toLowerCase())) all.push(t.toLowerCase());
        return sp;
      })
      .replace(/\s+/g, " ")
      .trim();
    if (!words && !all.length) return;
    const at = atISO();
    setError(null);
    startTransition(async () => {
      try {
        if (words) await addCheckNoteAction(words, at, allDay);
        for (const t of all) await addCheckNoteAction(`#${t}`, at, allDay);
        setText("");
        setTags([]);
        setWhen("now");
        setAllDay(false);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't log that.");
      }
    });
  }

  const recent = notes.filter((n) => !gone.has(n.id)).slice(-8).reverse();
  const chip = (on: boolean) =>
    on
      ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }
      : { border: "1px solid rgba(139,112,64,.4)", color: INK };

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="hover-glow flex h-10 items-center justify-center gap-1.5 self-start rounded-full px-4 text-[14px] font-bold" style={chip(true)}>
          <span aria-hidden>🏷</span> Log an event or #tag
        </button>
      ) : (
        <div ref={boxRef} className="reveal flex flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(255,250,235,.6)", border: "1px solid rgba(110,85,40,.25)" }}>
          <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1" style={{ background: "rgba(255,255,255,.65)", borderColor: "#b39a6a" }}>
            {tags.map((t) => (
              <span key={t} className="flex h-6 items-center gap-0.5 rounded-full pl-2 pr-0.5 text-[13px] font-semibold" style={{ background: "#e9d49a", border: "1px solid #8a6116", color: "#2a1c10" }}>
                #{t}
                <button type="button" onClick={() => setTags((x) => x.filter((y) => y !== t))} aria-label={`Remove #${t}`} className="flex h-5 w-5 items-center justify-center rounded-full text-[13px] leading-none hover:bg-black/10">
                  ×
                </button>
              </span>
            ))}
            <input
              autoFocus
              value={text}
              onChange={(e) => type(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Backspace" && !text && tags.length) setTags((t) => t.slice(0, -1));
              }}
              maxLength={200}
              placeholder={tags.length ? "more #tags, or what happened" : "What happened? e.g. Missed my medication #meds"}
              aria-label="What happened, or #tags"
              className="bare-input h-8 min-w-[140px] flex-1 bg-transparent px-1 text-[15px] focus:outline-none"
              style={{ color: INK }}
            />
          </div>
          <div role="radiogroup" aria-label="When" className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold" style={{ color: INK_SOFT }}>
              When
            </span>
            {(
              [
                ["now", "Now"],
                ["morning", "This morning"],
                ["yesterday", "Yesterday"],
                ["pick", "Pick a day…"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={when === k} onClick={() => setWhen(k)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={chip(when === k)}>
                {label}
              </button>
            ))}
            {when === "pick" && (
              <input
                type="date"
                value={pickDate}
                max={localInput(new Date()).slice(0, 10)}
                onChange={(e) => setPickDate(e.target.value)}
                aria-label="Which day"
                className="h-8 rounded-lg border px-2 text-[14px]"
                style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.65)", color: INK }}
              />
            )}
            {when === "pick" && !allDay && (
              <input
                type="time"
                value={pickTime}
                onChange={(e) => setPickTime(e.target.value)}
                aria-label="What time"
                className="h-8 rounded-lg border px-2 text-[14px]"
                style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.65)", color: INK }}
              />
            )}
            <label className="flex h-8 items-center gap-1.5 px-1 text-[13.5px] font-semibold" style={{ color: INK }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
          </div>
          {error && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full px-3 text-[14px] hover:bg-black/[.06]" style={{ color: INK }}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending || (!text.trim() && !tags.length)} className="h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
              {pending ? "Logging…" : "Log it"}
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Recent events and tags">
          {recent.map((n) => {
            const tag = /^#\S+$/.test(n.body);
            return (
              <li
                key={n.id}
                className="flex h-7 max-w-full items-center gap-1 rounded-full pl-2.5 pr-1 text-[13px]"
                style={tag ? { background: "#e9d49a", border: "1px solid #8a6116", color: "#2a1c10", fontWeight: 600 } : { background: "rgba(255,250,235,.7)", border: "1px solid rgba(139,112,64,.4)", color: INK }}
                title={new Date(n.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              >
                <span className="truncate">{n.body}</span>
                <span className="shrink-0 text-[11.5px] font-normal" style={{ color: INK_SOFT }}>
                  · {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setGone((g) => new Set(g).add(n.id));
                    void deleteCheckNoteAction(n.id).catch(() => setGone((g) => { const x = new Set(g); x.delete(n.id); return x; }));
                  }}
                  aria-label={`Remove “${n.body}”`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/10"
                  style={{ color: INK_SOFT }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

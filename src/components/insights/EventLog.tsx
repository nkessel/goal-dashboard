"use client";

import { TimeToken } from "@/components/xp/NightFields";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCheckNoteAction, deleteCheckNoteAction, updateCheckNoteAction } from "@/app/actions";
import { DateField } from "@/components/ui/DateField";

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

  // Today's show; earlier ones wait folded away.
  const [showEarlier, setShowEarlier] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const all = notes.filter((n) => !gone.has(n.id)).slice(-30).reverse();
  const todayKey = new Date().toDateString();
  const todays = all.filter((n) => new Date(n.created_at).toDateString() === todayKey);
  const earlier = all.filter((n) => new Date(n.created_at).toDateString() !== todayKey);
  const visible = showEarlier ? all : todays;
  function saveEdit(id: string, v: string) {
    setEditingNote(null);
    const text = v.trim();
    const before = edits[id] ?? notes.find((n) => n.id === id)?.body ?? "";
    if (!text || text === before) return;
    setEdits((e) => ({ ...e, [id]: text }));
    startTransition(async () => {
      try {
        await updateCheckNoteAction(id, text);
        router.refresh();
      } catch (e) {
        setEdits((x) => ({ ...x, [id]: before }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
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
          <div className="event-input flex min-h-11 flex-wrap items-center gap-1 rounded-xl px-2 py-1">
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
              className="bare-input h-8 min-w-[140px] flex-1 bg-transparent px-1 text-[16px] italic focus:outline-none"
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
              <DateField
                value={pickDate}
                max={localInput(new Date()).slice(0, 10)}
                onChange={(v) => v && setPickDate(v)}
                ariaLabel="Which day"
                className="h-8 rounded-lg border px-2 text-[14px]"
                style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.65)", color: INK }}
              />
            )}
            {when === "pick" && !allDay && (
              <TimeToken value={pickTime} onChange={setPickTime} label="What time" kind="any" compact />
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

      {visible.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Events and tags">
          {visible.map((n) => {
            const tag = /^#\S+$/.test(n.body);
            const body = edits[n.id] ?? n.body;
            return (
              <li key={n.id} className="relative max-w-full">
                <button
                  type="button"
                  onClick={() => setOpenNote(openNote === n.id ? null : n.id)}
                  aria-expanded={openNote === n.id}
                  className="flex h-7 max-w-[min(100%,240px)] items-center gap-1 rounded-full pl-2 pr-2.5 text-[13px]"
                  style={tag ? { background: "#e9d49a", border: "1px solid #8a6116", color: "#2a1c10", fontWeight: 600 } : { background: "rgba(255,250,235,.7)", border: "1px solid rgba(139,112,64,.4)", color: INK }}
                >
                  {!tag && <EventGlyph />}
                  <span className="min-w-0 truncate">{body.split("\n")[0]}</span>
                </button>
                {openNote === n.id && (
                  <div role="dialog" aria-label="Event" className="card-pop-in absolute left-0 top-8 z-20 flex w-[min(300px,80vw)] flex-col gap-2 rounded-xl p-3" style={{ background: "#fbf3df", border: "1.5px solid #b39a6a", boxShadow: "0 10px 24px rgba(0,0,0,.25)" }}>
                    {editingNote === n.id ? (
                      <textarea
                        autoFocus
                        defaultValue={body}
                        maxLength={400}
                        rows={Math.min(6, body.split("\n").length + 1)}
                        onKeyDown={(e) => {
                          // Enter saves; Shift+Enter starts a new line.
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(n.id, e.currentTarget.value);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingNote(null);
                          }
                        }}
                        onBlur={(e) => saveEdit(n.id, e.currentTarget.value)}
                        aria-label="Edit this event"
                        className="event-input resize-none rounded-lg px-2.5 py-2 text-[16px] leading-snug"
                        style={{ color: INK }}
                      />
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="m-0 min-w-0 flex-1 whitespace-pre-line text-[15px] leading-snug [overflow-wrap:anywhere]" style={{ color: INK }}>
                          {body}
                        </p>
                        <button type="button" onClick={() => setEditingNote(n.id)} aria-label="Edit" title="Edit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: INK_SOFT }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12.5px]" style={{ color: INK_SOFT }}>
                      <span className="flex-1">{new Date(n.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenNote(null);
                          setGone((g) => new Set(g).add(n.id));
                          void deleteCheckNoteAction(n.id).catch(() => setGone((g) => { const x = new Set(g); x.delete(n.id); return x; }));
                        }}
                        className="underline"
                        style={{ color: "#9a3b26" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {earlier.length > 0 && (
        <button type="button" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier} className="self-start text-[13px] underline underline-offset-2" style={{ color: INK_SOFT }}>
          {showEarlier ? "Hide earlier ones" : `Earlier (${earlier.length}) ▸`}
        </button>
      )}
    </div>
  );
}

/** A small event marker: a flag on a post. */
function EventGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: "#8a6116" }}>
      <path d="M6 21V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 4.5h10.5l-2.2 3.6 2.2 3.6H6" fill="currentColor" fillOpacity=".35" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

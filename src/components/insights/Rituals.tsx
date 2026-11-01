"use client";

import { useRef, useState } from "react";
import { saveRitualsAction } from "@/app/actions";
import { sinceLabel, type Ritual } from "@/lib/rituals";
import { Fold } from "@/components/ui/Fold";
import { DateField } from "@/components/ui/DateField";
import { freshKey } from "@/lib/quest-drafts";

const INK = "#3b2a14";
const SOFT = "#6b5631";
const nice = (k: string, today: string) => new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: k.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });

/**
 * Rituals of connection: how long since each, one tap when you did it,
 * and the days it was done (open a ritual to see or fix them).
 */
export function Rituals({ initial, today }: { initial: Ritual[]; today: string }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(0);

  function save(next: Ritual[]) {
    const before = list;
    setList(next);
    setError(null);
    const n = ++saving.current;
    saveRitualsAction(next)
      .then((r) => n === saving.current && setList(r))
      .catch((e) => {
        setList(before);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      });
  }
  const patch = (id: string, f: (r: Ritual) => Ritual) => save(list.map((r) => (r.id === id ? f(r) : r)));
  const log = (id: string, day: string) => patch(id, (r) => ({ ...r, log: [...new Set([day, ...r.log])].sort().reverse() }));
  function add() {
    const t = name.replace(/\s+/g, " ").trim();
    if (!t) return;
    save([...list, { id: freshKey("r").slice(0, 40), title: t, note: null, log: [] }]);
    setName("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 && !adding && (
        <p className="m-0 text-[13px] italic" style={{ color: SOFT }}>
          Things you do together now and then, like a couples covenant or the wheel of consent. Each one keeps how long it&rsquo;s been.
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {list.map((r) => (
          <RitualRow key={r.id} r={r} today={today} open={open === r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} onLog={(d) => log(r.id, d)} onUnlog={(d) => patch(r.id, (x) => ({ ...x, log: x.log.filter((k) => k !== d) }))} onRename={(title, note) => patch(r.id, (x) => ({ ...x, title, note }))} onDelete={() => save(list.filter((x) => x.id !== r.id))} />
        ))}
      </ul>
      <Fold open={adding}>
        <div className="flex items-center gap-2 pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. Wheel of consent" maxLength={120} aria-label="Ritual name" className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: INK }} />
          <button type="button" onClick={add} disabled={!name.trim()} className="h-9 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Add
          </button>
        </div>
      </Fold>
      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="self-start text-[13px] font-semibold" style={{ color: "#8a6116" }}>
          + A ritual of connection
        </button>
      )}
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function RitualRow({ r, today, open, onToggle, onLog, onUnlog, onRename, onDelete }: { r: Ritual; today: string; open: boolean; onToggle: () => void; onLog: (day: string) => void; onUnlog: (day: string) => void; onRename: (title: string, note: string | null) => void; onDelete: () => void }) {
  const [day, setDay] = useState(today);
  const [title, setTitle] = useState(r.title);
  const [note, setNote] = useState(r.note ?? "");
  const [sure, setSure] = useState(false);
  const last = r.log[0];
  const doneToday = last === today;
  const commit = () => {
    const t = title.replace(/\s+/g, " ").trim();
    if (!t) return setTitle(r.title);
    if (t !== r.title || (note.trim() || null) !== (r.note ?? null)) onRename(t, note.trim() || null);
  };
  return (
    <li className="rounded-xl" style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid rgba(139,112,64,.3)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span aria-hidden>💞</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold leading-tight" style={{ color: INK }}>
              {r.title}
            </span>
            <span className="block text-[12.5px]" style={{ color: SOFT }}>
              {sinceLabel(last, today)}
              {r.log.length > 1 ? ` · ${r.log.length} times` : ""}
            </span>
          </span>
        </button>
        {doneToday ? (
          <span className="text-[12.5px] font-semibold" style={{ color: "#5d7a2e" }}>
            Today ✓
          </span>
        ) : (
          <button type="button" onClick={() => onLog(today)} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Did it ✓
          </button>
        )}
      </div>
      <Fold open={open}>
        <div className="flex flex-col gap-2 px-3 pb-2.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} maxLength={120} aria-label="Ritual name" className="bare-input h-8 rounded-md px-1.5 text-[15px] font-semibold" style={{ color: INK, background: "rgba(255,250,238,.5)" }} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={commit} rows={2} maxLength={600} placeholder="A note (how you do it, what you need)…" aria-label="Note" className="rounded-md border px-2 py-1 text-[16px] leading-snug" style={{ borderColor: "rgba(139,112,64,.35)", background: "rgba(255,250,238,.5)", color: INK }} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold" style={{ color: SOFT }}>
              Another day
            </span>
            <DateField value={day} max={today} onChange={setDay} ariaLabel="Which day" className="h-8 rounded-lg border px-2 text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: INK }} />
            <button type="button" disabled={!day || r.log.includes(day)} onClick={() => onLog(day)} className="h-8 rounded-full px-3 text-[12.5px] font-bold disabled:opacity-50" style={{ border: "1px solid #b39a6a", color: INK }}>
              {r.log.includes(day) ? "Logged" : "Log it"}
            </button>
          </div>
          {r.log.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Times it was done">
              {r.log.map((k) => (
                <li key={k} className="due-in flex h-7 items-center gap-1 rounded-full pl-2.5 pr-1 text-[12.5px]" style={{ background: "rgba(201,162,74,.18)", color: INK }}>
                  {nice(k, today)}
                  <button type="button" onClick={() => onUnlog(k)} aria-label={`Remove ${nice(k, today)}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none" style={{ color: SOFT }}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 text-[12.5px]">
            {sure ? (
              <>
                <span style={{ color: INK }}>Remove this ritual and its history?</span>
                <button type="button" onClick={onDelete} className="font-bold" style={{ color: "#a33c2a" }}>
                  Yes, remove
                </button>
                <button type="button" onClick={() => setSure(false)} className="font-semibold" style={{ color: SOFT }}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setSure(true)} className="font-semibold" style={{ color: SOFT }}>
                Remove ritual
              </button>
            )}
          </div>
        </div>
      </Fold>
    </li>
  );
}

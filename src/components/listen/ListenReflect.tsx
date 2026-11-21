"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveListenReflectConfigAction, saveListenReflectionAction, type ListenReflectConfig } from "@/app/listen-actions";
import { LEARNING_QUOTES, type ListenReflection } from "@/lib/listen";
import { GearIcon } from "@/components/ui/Icons";
import { Fold } from "@/components/ui/Fold";

/**
 * The reflect screen, under whatever was just finished (owner, Nov 20; review page #d6): a learning
 * quote, "What stayed with you?", things to remember, Worth a replay, a Rate pill that opens to
 * stars, Add notes, and Save (× closes without saving). Its gear edits it in place: drag a part,
 * ✎ to rename it (or edit the quotes), the eye to hide it, and when it opens, in a strip above.
 */

const PARTS = [
  { key: "quote", label: "Learning quote" },
  { key: "takeaway", label: "What stayed with you?" },
  { key: "remember", label: "To remember from this lesson" },
  { key: "replay", label: "Worth a replay" },
  { key: "rating", label: "Rate" },
  { key: "notes", label: "Add notes" },
] as const;
type PartKey = (typeof PARTS)[number]["key"];
const DEFAULT_ORDER = PARTS.map((p) => p.key) as string[];

const INK = "#2a2418";
const SOFT = "#6b6252";
const GOLD = "#8a6116";

function layoutOf(cfg: ListenReflectConfig) {
  const known = new Set(DEFAULT_ORDER);
  const order = (cfg.order ?? []).filter((k) => known.has(k));
  for (const [i, k] of DEFAULT_ORDER.entries()) if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  return { order: [...new Set(order)] as PartKey[], hidden: new Set((cfg.hidden ?? []).filter((k) => known.has(k))) };
}

export function ListenReflect({ taskId, itemKey, title, xp, saved, config: initialConfig, onClose }: { taskId: string; itemKey: string | null; title: string; xp: number; saved: ListenReflection | null; config: ListenReflectConfig; onClose: () => void }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ListenReflectConfig>(initialConfig);
  const [editing, setEditing] = useState(false);
  const [takeaway, setTakeaway] = useState(saved?.takeaway ?? "");
  const [remember, setRemember] = useState<string[]>(saved?.remember ?? []);
  const [newLine, setNewLine] = useState("");
  const [replay, setReplay] = useState(!!saved?.replay);
  const [rating, setRating] = useState(saved?.rating ?? 0);
  const [rateOpen, setRateOpen] = useState(false);
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(!!saved?.notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [, startCfg] = useTransition();
  const label = (k: PartKey) => cfg.labels?.[k] || PARTS.find((p) => p.key === k)!.label;
  const { order, hidden } = layoutOf(cfg);

  const quotes = useMemo(() => [...LEARNING_QUOTES.filter((q) => !(cfg.removedQuotes ?? []).includes(q.text)), ...(cfg.quotes ?? [])], [cfg.quotes, cfg.removedQuotes]);
  // A different quote each time it opens (picked once per opening).
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  const quote = quotes.length ? quotes[seed % quotes.length] : null;

  function saveCfg(next: ListenReflectConfig) {
    const before = cfg;
    setCfg(next);
    startCfg(() => void saveListenReflectConfigAction(next).then(setCfg, () => (setCfg(before), setError("Couldn't save that setting."))));
  }

  function save() {
    setError(null);
    const lines = newLine.trim() ? [...remember, newLine.trim()] : remember;
    start(async () => {
      try {
        await saveListenReflectionAction(taskId, itemKey, { takeaway, remember: lines, replay, rating, notes, itemTitle: title });
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save it.");
      }
    });
  }

  const part = (k: PartKey): React.ReactNode => {
    switch (k) {
      case "quote":
        return quote ? (
          <figure className="listen-quote m-0">
            <blockquote className="m-0">“{quote.text}”</blockquote>
            <figcaption>{quote.by}</figcaption>
          </figure>
        ) : null;
      case "takeaway":
        return (
          <label className="flex flex-col gap-1">
            <span className="listen-q">{label("takeaway")}</span>
            <textarea className="listen-input listen-write" rows={2} value={takeaway} onChange={(e) => setTakeaway(e.target.value)} placeholder="A line or two" />
          </label>
        );
      case "remember":
        return (
          <div className="flex flex-col gap-1">
            <span className="listen-label">{label("remember")}</span>
            {remember.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[15.5px]" style={{ color: INK }}>
                <span aria-hidden>·</span>
                <span className="user-text flex-1" dir="auto">
                  {r}
                </span>
                <button type="button" className="listen-mini" aria-label={`Remove "${r}"`} onClick={() => setRemember(remember.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newLine.trim()) return;
                setRemember([...remember, newLine.trim()]);
                setNewLine("");
              }}
            >
              <input className="listen-input flex-1" aria-label={label("remember")} placeholder="+ Add one" value={newLine} onChange={(e) => setNewLine(e.target.value)} />
              {newLine.trim() && (
                <button type="submit" className="listen-btn quiet">
                  Add
                </button>
              )}
            </form>
          </div>
        );
      case "replay":
        return (
          <label className="flex cursor-pointer items-center gap-2 text-[15.5px]" style={{ color: INK }}>
            <input type="checkbox" className="peer sr-only" checked={replay} onChange={(e) => setReplay(e.target.checked)} />
            <span aria-hidden className={`listen-tickbox ${replay ? "on" : ""}`}>
              {replay && "✓"}
            </span>
            {label("replay")}
          </label>
        );
      case "rating":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`listen-pill ${rateOpen ? "on" : ""}`} aria-expanded={rateOpen} onClick={() => setRateOpen((v) => !v)}>
              <span style={{ color: GOLD }}>{rating ? "★".repeat(rating) : "☆"}</span> {label("rating")} <span aria-hidden>▾</span>
            </button>
            {rateOpen && (
              <span role="radiogroup" aria-label={label("rating")} className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} className="listen-star" onClick={() => (setRating(rating === n ? 0 : n), setRateOpen(false))}>
                    {n <= rating ? "★" : "☆"}
                  </button>
                ))}
              </span>
            )}
          </div>
        );
      case "notes":
        return notesOpen ? (
          <label className="flex flex-col gap-1">
            <span className="listen-label">{label("notes")}</span>
            <textarea className="listen-input listen-write" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus={!saved?.notes} />
          </label>
        ) : (
          <button type="button" className="listen-btn quiet self-start" onClick={() => setNotesOpen(true)}>
            + {label("notes")}
          </button>
        );
    }
  };

  return (
    <section className="listen-reflect" aria-label={`Reflect on ${title}`} data-listen-reflect>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div dir="auto" className="user-text text-[16px] font-semibold leading-snug" style={{ color: INK }}>
            {title}
          </div>
          <div className="text-[13.5px] italic" style={{ color: SOFT }}>
            {xp > 0 ? `Finished · +${xp} XP earned` : "Finished"}
          </div>
        </div>
        <button type="button" className="listen-icon" aria-pressed={editing} aria-label={editing ? "Done editing this screen" : "Edit this screen"} title={editing ? "Done editing" : "Edit this screen"} onClick={() => setEditing((v) => !v)}>
          <GearIcon size={16} />
        </button>
        <button type="button" className="listen-icon" aria-label="Close without saving" title="Close without saving" onClick={onClose}>
          ×
        </button>
      </div>

      {editing ? (
        <ReflectEditor cfg={cfg} order={order} hidden={hidden} label={label} quotes={quotes} onChange={saveCfg} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {order
            .filter((k) => !hidden.has(k))
            .map((k) => {
              const n = part(k);
              return n ? <div key={k}>{n}</div> : null;
            })}
          {error && (
            <p role="alert" className="m-0 text-[14px]" style={{ color: "#9b2c1f" }}>
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <button type="button" className="listen-btn primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The reflect screen with its gear on: each part with its eye and ✎, drag to reorder, and when it opens. */
function ReflectEditor({ cfg, order, hidden, label, quotes, onChange, onDone }: { cfg: ListenReflectConfig; order: PartKey[]; hidden: Set<string>; label: (k: PartKey) => string; quotes: { text: string; by: string }[]; onChange: (c: ListenReflectConfig) => void; onDone: () => void }) {
  const [renaming, setRenaming] = useState<PartKey | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    onChange({ ...cfg, order: arrayMove(order, order.indexOf(e.active.id as PartKey), order.indexOf(e.over.id as PartKey)) });
  }
  const when = cfg.openWhen ?? "every";
  return (
    <div className="mt-2 flex flex-col gap-2" data-listen-reflect-edit>
      <div className="listen-strip" role="radiogroup" aria-label="When this opens">
        <span>Opens after finishing:</span>
        {(
          [
            ["every", "every item"],
            ["courses", "only courses"],
            ["never", "never"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={when === k} className={`listen-chip ${when === k ? "on" : ""}`} onClick={() => onChange({ ...cfg, openWhen: k })}>
            {t}
          </button>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="m-0 list-none p-0">
            {order.map((k) => (
              <EditPart
                key={k}
                k={k}
                label={label(k)}
                hidden={hidden.has(k)}
                renaming={renaming === k}
                onEye={() => {
                  const h = new Set(hidden);
                  if (h.has(k)) h.delete(k);
                  else h.add(k);
                  onChange({ ...cfg, hidden: [...h] });
                }}
                onPen={() => setRenaming(renaming === k ? null : k)}
                onRename={(name) => (setRenaming(null), onChange({ ...cfg, labels: { ...(cfg.labels ?? {}), [k]: name } }))}
                extra={k === "quote" ? <QuoteEditor cfg={cfg} quotes={quotes} onChange={onChange} /> : null}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="m-0 text-[13.5px] italic" style={{ color: SOFT }}>
        Drag a part to move it. ✎ renames it, the eye hides it.
      </p>
      <div className="flex justify-end">
        <button type="button" className="listen-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function EditPart({ k, label, hidden, renaming, onEye, onPen, onRename, extra }: { k: PartKey; label: string; hidden: boolean; renaming: boolean; onEye: () => void; onPen: () => void; onRename: (name: string) => void; extra: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: k });
  const [name, setName] = useState(label);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined }} className={`listen-edpart ${hidden ? "is-off" : ""}`}>
      <div className="flex items-center gap-2">
        <button type="button" ref={setActivatorNodeRef} className="listen-grip" aria-label={`Drag ${label} to move it`} {...attributes} {...listeners}>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
            {[3, 8, 13].map((y) => (
              <g key={y}>
                <circle cx="3.5" cy={y} r="1.3" />
                <circle cx="8.5" cy={y} r="1.3" />
              </g>
            ))}
          </svg>
        </button>
        <span className="flex-1 text-[15.5px]">{label}</span>
        <button type="button" className="listen-pen" aria-label={`Rename ${label}`} aria-expanded={renaming} onClick={onPen}>
          ✎
        </button>
        <button type="button" className="listen-eye" aria-pressed={!hidden} aria-label={hidden ? `Show ${label}` : `Hide ${label}`} onClick={onEye}>
          <EyeIcon off={hidden} />
        </button>
      </div>
      <Fold open={renaming}>
        {renaming && (
          <div className="flex flex-col gap-2 py-2 pl-6">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onRename(name.trim());
              }}
            >
              <input className="listen-input flex-1" aria-label={`New name for ${label}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <button type="submit" className="listen-btn">
                Save
              </button>
            </form>
            {extra}
          </div>
        )}
      </Fold>
    </li>
  );
}

function QuoteEditor({ cfg, quotes, onChange }: { cfg: ListenReflectConfig; quotes: { text: string; by: string }[]; onChange: (c: ListenReflectConfig) => void }) {
  const [text, setText] = useState("");
  const [by, setBy] = useState("");
  const builtIn = new Set(LEARNING_QUOTES.map((q) => q.text));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="listen-label">The quotes it picks from</span>
      {quotes.map((q) => (
        <div key={q.text} className="flex items-start gap-2 text-[14px]" style={{ color: INK }}>
          <span className="flex-1 italic">
            “{q.text}” <span style={{ color: SOFT, fontStyle: "normal" }}>{q.by}</span>
          </span>
          <button
            type="button"
            className="listen-mini"
            aria-label="Remove this quote"
            onClick={() =>
              builtIn.has(q.text)
                ? onChange({ ...cfg, removedQuotes: [...(cfg.removedQuotes ?? []), q.text] })
                : onChange({ ...cfg, quotes: (cfg.quotes ?? []).filter((x) => x.text !== q.text) })
            }
          >
            ×
          </button>
        </div>
      ))}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange({ ...cfg, quotes: [...(cfg.quotes ?? []), { text: text.trim(), by: by.trim() }] });
          setText("");
          setBy("");
        }}
      >
        <input className="listen-input" aria-label="A quote to add" placeholder="+ Add a quote" value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() && (
          <div className="flex items-center gap-2">
            <input className="listen-input flex-1" aria-label="Who said it" placeholder="Who said it" value={by} onChange={(e) => setBy(e.target.value)} />
            <button type="submit" className="listen-btn">
              Add
            </button>
          </div>
        )}
      </form>
      {(cfg.removedQuotes ?? []).length > 0 && (
        <button type="button" className="listen-mini self-start" onClick={() => onChange({ ...cfg, removedQuotes: [] })}>
          Bring back the {(cfg.removedQuotes ?? []).length} removed
        </button>
      )}
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
      {off && <path d="M4 20L20 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
}

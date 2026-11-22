"use client";

import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { stopKeysButSave } from "@/lib/stop-keys";
import { useEffect, useRef, useState } from "react";
import { translatePhraseAction } from "@/app/actions";
import { DEFAULT_LANGUAGES, MORE_LANGUAGES, PHRASE_IDEAS, approxNote, type Translation } from "@/lib/languages";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";

const KEY = "learn-language";
type Saved = { langs: string[]; off: string[] };
function readSaved(): Saved {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "null") as Saved | null;
    if (v && Array.isArray(v.langs) && Array.isArray(v.off)) return v;
  } catch {
    /* storage unavailable */
  }
  return { langs: DEFAULT_LANGUAGES, off: [] };
}
function writeSaved(v: Saved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const INK = "var(--t-ink)";
const SOFT = "var(--t-ink-soft)";
const chipOn = { background: "rgba(201,162,74,.2)", border: "1px solid rgba(160,120,40,.75)", color: "#5a3d12" };
const chipOff = { background: "transparent", border: "1px dashed rgba(139,112,64,.4)", color: SOFT };

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A printable page of the phrase in every language (opens the print dialog). */
function printSheet(phrase: string, rows: Translation[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const body = rows
    .map((r) => `<tr><th>${esc(r.language)}${r.approx ? " <small>(approx.)</small>" : ""}</th><td><div class="t">${esc(r.text)}</div>${r.say ? `<div class="s">${esc(r.say)}</div>` : ""}</td></tr>`)
    .join("");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(phrase)}</title><style>body{font:16px Georgia,serif;margin:32px;color:#2a1c10}h1{font-size:26px;margin:0 0 4px}p{color:#6b5a3a;margin:0 0 18px}table{border-collapse:collapse;width:100%}th{text-align:left;vertical-align:top;padding:8px 14px 8px 0;width:30%;font-weight:600}td{padding:8px 0;border-bottom:1px solid #e3d6b8}.t{font-size:20px}.s{color:#6b5a3a;font-style:italic;font-size:14px}small{color:#8a6a3a;font-weight:400}</style><h1>${esc(phrase)}</h1><p>${new Date().toLocaleDateString()}${rows.some((r) => r.approx) ? " · (approx.) = reconstructed, a best guess" : ""}</p><table>${body}</table><script>setTimeout(()=>print(),200)</script>`);
  w.document.close();
}

// The last phrase and its words, kept so the window comes back as you left it.
const LAST = "learn-language-last";
type Last = { phrase: string; rows: Translation[] | null };
function readLast(): Last {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAST) || "null") as { phrase?: string; rows?: Translation[] | null } | null;
    return { phrase: typeof v?.phrase === "string" ? v.phrase : "", rows: Array.isArray(v?.rows) ? v.rows : null };
  } catch {
    return { phrase: "", rows: null };
  }
}
function writeLast(v: Last) {
  try {
    window.localStorage.setItem(LAST, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

// Your phrases over time (owner, Nov 12): every learning sheet, newest first, to bring back and study.
const SHEETS = "learn-language-sheets";
type Sheet = { phrase: string; rows: Translation[]; at: string };
function readSheets(): Sheet[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SHEETS) || "[]") as Sheet[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.phrase === "string" && Array.isArray(x.rows)) : [];
  } catch {
    return [];
  }
}
function writeSheets(v: Sheet[]) {
  try {
    window.localStorage.setItem(SHEETS, JSON.stringify(v.slice(0, 60)));
  } catch {
    /* storage unavailable */
  }
}
function keepSheet(phrase: string, rows: Translation[]) {
  const k = phrase.trim().toLowerCase();
  writeSheets([{ phrase: phrase.trim(), rows, at: new Date().toISOString() }, ...readSheets().filter((x) => x.phrase.trim().toLowerCase() !== k)]);
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// The idea phrases are yours to change: hold or right-click one to edit it or add a new one.
const IDEAS = "learn-language-ideas";
function readIdeas(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(IDEAS) || "null") as string[] | null;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  } catch {
    /* storage unavailable */
  }
  return PHRASE_IDEAS;
}
function writeIdeas(v: string[]) {
  try {
    window.localStorage.setItem(IDEAS, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

// A translation keeps going when the window is minimized: it lives outside the window and
// lands in the last sheet, which the window reads again when it opens.
let pending: string | null = null;
let pendingError: string | null = null;
function runLearn(phrase: string, langs: string[]) {
  pending = phrase;
  pendingError = null;
  window.dispatchEvent(new Event("learn-language"));
  translatePhraseAction(phrase, langs)
    .then((r) => {
      if (r.error) pendingError = r.error;
      if (r.results.length) {
        writeLast({ phrase, rows: r.results });
        keepSheet(phrase, r.results);
      }
    })
    .catch(() => {
      pendingError = "The words didn't come this time. Try again in a moment.";
    })
    .finally(() => {
      pending = null;
      window.dispatchEvent(new Event("learn-language"));
    });
}

// Scripts some computers have no font for (Phoenician on many): a web font fills the gap.
const SCRIPT_FONTS = "https://fonts.googleapis.com/css2?family=Noto+Sans+Phoenician&family=Noto+Sans:wght@400;600&display=swap";
const SCRIPT_STACK = "var(--font-eb-garamond), Georgia, 'Noto Sans Phoenician', 'Segoe UI Historic', 'Noto Sans', 'Segoe UI', serif";
function useScriptFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-script-fonts]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = SCRIPT_FONTS;
    l.dataset.scriptFonts = "1";
    document.head.appendChild(l);
  }, []);
}

/** Hold (or right-click) for a menu; a plain tap does the tap. */
function useHold(onHold: (key: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  return (key: string, onTap: () => void) => ({
    onClick: () => (held.current ? (held.current = false) : onTap()),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onHold(key);
    },
    onPointerDown: () => {
      held.current = false;
      timer.current = setTimeout(() => {
        held.current = true;
        onHold(key);
      }, 500);
    },
    onPointerUp: () => timer.current && clearTimeout(timer.current),
    onPointerLeave: () => timer.current && clearTimeout(timer.current),
  });
}

const GOLD_BTN = { background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", color: "#2a1c10", border: "1px solid #8a6116" } as const;
const QUIET_BTN = { border: "1px solid rgba(139,112,64,.45)", color: "#5a3d12" } as const;

/** Learn a language: a phrase, the languages you're learning (all on), and the phrase in each. */
export function LearnLanguage() {
  useScriptFonts();
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [last] = useState(readLast);
  const [phrase, setPhrase] = useState(last.phrase);
  const [adding, setAdding] = useState(false);
  const [newLang, setNewLang] = useState("");
  const [rows, setRows] = useState<Translation[] | null>(last.rows);
  // Once a phrase is learned, the window is the learning sheet: no ideas, no languages, until "New phrase".
  const [composing, setComposing] = useState(!last.rows);
  const [busy, setBusy] = useState(() => pending !== null);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState(readIdeas);
  const [ideaEdit, setIdeaEdit] = useState<{ i: number; text: string } | null>(null);
  const [past, setPast] = useState(false);
  const [sheets, setSheets] = useState(readSheets);
  // Right-click or long-press a language: it asks to remove it, in place.
  const [asking, setAsking] = useState<string | null>(null);
  const holdLang = useHold((l) => setAsking(l));
  const holdIdea = useHold((k) => {
    const i = Number(k);
    setIdeaEdit({ i, text: ideas[i] ?? "" });
  });
  useEffect(() => {
    writeLast({ phrase, rows });
  }, [phrase, rows]);
  useEffect(() => {
    const done = () => {
      setBusy(pending !== null);
      if (pending !== null) return;
      if (pendingError) setError(pendingError);
      const l = readLast();
      if (l.rows) {
        setPhrase(l.phrase);
        setRows(l.rows);
        setComposing(false);
      }
      setSheets(readSheets());
    };
    window.addEventListener("learn-language", done);
    return () => window.removeEventListener("learn-language", done);
  }, []);
  const on = saved.langs.filter((l) => !saved.off.includes(l));
  const save = (v: Saved) => (setSaved(v), writeSaved(v));
  const remove = (l: string) => (save({ langs: saved.langs.filter((x) => x !== l), off: saved.off.filter((x) => x !== l) }), setAsking(null));
  const toggle = (l: string) => save({ ...saved, off: saved.off.includes(l) ? saved.off.filter((x) => x !== l) : [...saved.off, l] });
  const addLang = (raw: string) => {
    const l = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    setNewLang("");
    setAdding(false);
    if (!l) return;
    const known = [...saved.langs, ...MORE_LANGUAGES].find((x) => x.toLowerCase() === l.toLowerCase()) ?? l;
    if (saved.langs.some((x) => x.toLowerCase() === known.toLowerCase())) return save({ ...saved, off: saved.off.filter((x) => x.toLowerCase() !== known.toLowerCase()) });
    save({ langs: [...saved.langs, known], off: saved.off });
  };
  const saveIdeas = (v: string[]) => (setIdeas(v), writeIdeas(v), setIdeaEdit(null));
  const ideaText = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 80);
  const learn = () => {
    const p = phrase.trim();
    if (!p || !on.length || busy) return;
    setError(null);
    runLearn(p, on);
  };
  const openSheet = (s: Sheet) => (setPhrase(s.phrase), setRows(s.rows), setComposing(false), setPast(false), setError(null));
  const forget = (s: Sheet) => {
    const next = sheets.filter((x) => x !== s);
    setSheets(next);
    writeSheets(next);
  };
  const listId = "learn-language-list";
  const showSheet = !composing && !!rows;
  const pastButton = sheets.length > 0 && (
    <button type="button" onClick={() => setPast((o) => !o)} aria-expanded={past} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ ...QUIET_BTN, background: past ? "rgba(217,180,95,.3)" : undefined }}>
      My phrases
    </button>
  );
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <Fold open={!showSheet}>
        <div className="flex flex-col gap-2">
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value.slice(0, 200))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                learn();
              }
            }}
            rows={1}
            placeholder="A phrase to learn…"
            aria-label="A phrase to learn"
            className="w-full resize-none rounded-xl px-3 py-2 text-[16px] leading-snug outline-none"
            style={{ background: "rgba(255,250,238,.75)", border: "1px solid rgba(139,112,64,.4)", color: INK }}
          />
          {/* Ideas: one tap fills the phrase; hold or right-click one to edit it or add a new one. */}
          <div className="flex flex-wrap gap-1">
            {ideas.map((p, i) =>
              ideaEdit?.i === i ? (
                <IdeaEditor
                  key={`edit-${i}`}
                  text={ideaEdit.text}
                  onText={(text) => setIdeaEdit({ i, text })}
                  onSave={() => (ideaText(ideaEdit.text) ? saveIdeas(ideas.map((x, j) => (j === i ? ideaText(ideaEdit.text) : x))) : setIdeaEdit(null))}
                  onNew={() => setIdeaEdit({ i: ideas.length, text: "" })}
                  onRemove={() => saveIdeas(ideas.filter((_, j) => j !== i))}
                  onCancel={() => setIdeaEdit(null)}
                />
              ) : (
                <button
                  key={`${i}-${p}`}
                  type="button"
                  {...holdIdea(String(i), () => setPhrase(p))}
                  title="Tap to use · hold or right-click to edit"
                  className="h-7 select-none rounded-full px-2.5 text-[12.5px] [-webkit-touch-callout:none]"
                  style={phrase === p ? chipOn : { border: "1px solid rgba(139,112,64,.3)", color: SOFT }}
                >
                  {p}
                </button>
              ),
            )}
            {ideaEdit?.i === ideas.length ? (
              <IdeaEditor
                text={ideaEdit.text}
                onText={(text) => setIdeaEdit({ i: ideas.length, text })}
                onSave={() => (ideaText(ideaEdit.text) ? saveIdeas([...ideas, ideaText(ideaEdit.text)]) : setIdeaEdit(null))}
                onCancel={() => setIdeaEdit(null)}
              />
            ) : (
              <button type="button" onClick={() => setIdeaEdit({ i: ideas.length, text: "" })} aria-label="Add a phrase idea" title="Add a phrase idea" className="flex h-7 w-7 items-center justify-center rounded-full text-[15px]" style={{ border: "1px dashed rgba(139,112,64,.45)", color: SOFT }}>
                +
              </button>
            )}
          </div>
          {/* Languages: all on until you tap one off; + adds another. */}
          <div className="flex flex-wrap items-center gap-1">
            {saved.langs.map((l) => {
              const isOn = !saved.off.includes(l);
              return asking === l ? (
                <span key={l} className="reveal flex h-7 items-center gap-1 rounded-full pl-2.5 pr-1 text-[12.5px]" style={{ border: "1px solid rgba(163,60,42,.55)", color: INK }}>
                  Remove {l}?
                  <button type="button" onClick={() => remove(l)} className="h-6 rounded-full px-2 font-bold" style={{ color: "#a33c2a" }}>
                    Remove
                  </button>
                  <button type="button" onClick={() => setAsking(null)} aria-label="Keep it" className="flex h-6 w-6 items-center justify-center rounded-full" style={{ color: SOFT }}>
                    <CloseIcon size={10} />
                  </button>
                </span>
              ) : (
                <button
                  key={l}
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  {...holdLang(l, () => toggle(l))}
                  title={approxNote(l) || "Right-click or hold to remove"}
                  className="h-7 select-none rounded-full px-2.5 text-[12.5px] font-semibold [-webkit-touch-callout:none]"
                  style={isOn ? chipOn : chipOff}
                >
                  {l}
                  {approxNote(l) && <span className="ml-0.5 opacity-70">*</span>}
                </button>
              );
            })}
            {adding ? (
              <form
                className="flex items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  addLang(newLang);
                }}
              >
                <input
                  autoFocus
                  list={listId}
                  value={newLang}
                  onChange={(e) => setNewLang(e.target.value)}
                  onBlur={() => (newLang.trim() ? addLang(newLang) : setAdding(false))}
                  placeholder="Language…"
                  aria-label="Add a language"
                  className="h-7 w-32 rounded-full bg-transparent px-2.5 text-[16px] outline-none"
                  style={{ border: "1px solid rgba(160,120,40,.6)", color: INK }}
                />
                <datalist id={listId}>
                  {MORE_LANGUAGES.filter((m) => !saved.langs.includes(m)).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} aria-label="Add a language" title="Add a language" className="flex h-7 w-7 items-center justify-center rounded-full text-[16px]" style={{ border: "1px solid rgba(160,120,40,.6)", color: "#8a6116" }}>
                +
              </button>
            )}
          </div>
        </div>
      </Fold>
      {/* The learning sheet: the phrase, then each language with its words one by one. */}
      <Fold open={showSheet}>
        <div className="flex flex-col">
          <h3 className="font-display m-0 pb-1 text-[18px] leading-snug [overflow-wrap:anywhere]" style={{ color: INK }}>
            {phrase.trim()}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {(rows ?? []).map((r) => (
              <li key={r.language} className="due-in flex items-baseline gap-2 border-b py-1.5" style={{ borderColor: "rgba(139,112,64,.2)" }}>
                <span className="w-[30%] shrink-0 text-[12.5px] font-semibold" style={{ color: SOFT }} title={r.approx}>
                  {r.language}
                  {r.approx && <span className="ml-1 text-[11px] font-normal italic">approx.</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] leading-snug [overflow-wrap:anywhere]" style={{ color: INK, fontFamily: SCRIPT_STACK }}>
                    {r.text}
                  </span>
                  {r.say && (
                    <span className="block text-[12.5px] italic" style={{ color: SOFT }}>
                      {r.say}
                    </span>
                  )}
                  {r.words && (
                    <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1" aria-label={`${r.language}, word by word`}>
                      {r.words.map((w, i) => (
                        <span key={i} className="flex flex-col leading-tight">
                          <span className="text-[14px]" style={{ color: INK, fontFamily: SCRIPT_STACK }}>
                            {w.w}
                          </span>
                          {w.say && w.say !== w.w && (
                            <span className="text-[11px] italic" style={{ color: SOFT }}>
                              {w.say}
                            </span>
                          )}
                          {w.means && (
                            <span className="text-[11px]" style={{ color: "#8a6116" }}>
                              {w.means}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {rows?.some((r) => r.approx) && (
            <p className="m-0 pt-1 text-[11.5px] italic" style={{ color: SOFT }}>
              * Reconstructed languages: a best guess from old sources.
            </p>
          )}
        </div>
      </Fold>
      {/* Your past phrases, by day: one tap brings its sheet back. */}
      <Fold open={past}>
        <ul className="m-0 flex list-none flex-col p-0" aria-label="My phrases">
          {sheets.map((s, i) => (
            <li key={`${s.at}-${s.phrase}`} className="flex flex-col">
              {(i === 0 || dayLabel(sheets[i - 1].at) !== dayLabel(s.at)) && (
                <span className="pt-1 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: SOFT }}>
                  {dayLabel(s.at)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => openSheet(s)} className="min-h-8 min-w-0 flex-1 truncate rounded-lg px-1 text-left text-[14px] hover:bg-black/[.04]" style={{ color: INK }}>
                  {s.phrase}
                </button>
                <button type="button" onClick={() => forget(s)} aria-label={`Forget "${s.phrase}"`} title="Forget this one" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ color: SOFT }}>
                  <CloseIcon size={9} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Fold>
      {/* The bar: quiet buttons on the left, the main one in the bottom-right corner. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pastButton}
        {showSheet ? (
          <button type="button" onClick={() => printSheet(phrase.trim(), rows!)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={QUIET_BTN}>
            Print
          </button>
        ) : (
          rows && (
            <button type="button" onClick={() => (setComposing(false), setError(null))} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={QUIET_BTN}>
              Back to the sheet
            </button>
          )
        )}
        {error && (
          <span className="text-[12.5px]" style={{ color: "#8b2c1a" }}>
            {error}
          </span>
        )}
        <span className="flex-1" />
        {showSheet ? (
          <button type="button" onClick={() => (setComposing(true), setPhrase(""), setPast(false))} className="hover-glow h-9 rounded-full px-4 text-[14px] font-semibold" style={GOLD_BTN}>
            New phrase
          </button>
        ) : (
          <button type="button" onClick={learn} disabled={!phrase.trim() || !on.length || busy} className="hover-glow h-9 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50" style={GOLD_BTN}>
            {busy ? "Learning…" : "Learn"}
          </button>
        )}
      </div>
    </div>
  );
}

/** A phrase idea being edited in place: Save, + New (keep this one and add another), Remove. */
function IdeaEditor({ text, onText, onSave, onNew, onRemove, onCancel }: { text: string; onText: (t: string) => void; onSave: () => void; onNew?: () => void; onRemove?: () => void; onCancel: () => void }) {
  return (
    <span className="reveal flex h-8 items-center gap-0.5 rounded-full pl-2 pr-0.5 text-[12.5px]" style={{ border: "1px solid rgba(160,120,40,.75)", background: "rgba(255,250,238,.7)" }}>
      <input
        autoFocus
        value={text}
        onChange={(e) => onText(e.target.value.slice(0, 80))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            if (e.key === "Enter") onSave();
            else onCancel();
          }
        }}
        placeholder="A phrase…"
        aria-label="Phrase idea"
        className="bare-input w-32 bg-transparent text-[16px] outline-none"
        style={{ color: INK }}
      />
      <button type="button" onClick={onSave} className="h-7 rounded-full px-2 font-bold" style={{ color: "#5a3d12" }}>
        Save
      </button>
      {onNew && (
        <button type="button" onClick={onNew} className="h-7 rounded-full px-2 font-semibold" style={{ color: "#5a3d12" }}>
          + New
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="h-7 rounded-full px-2 font-semibold" style={{ color: "#a33c2a" }}>
          Remove
        </button>
      )}
      <button type="button" onClick={onCancel} aria-label="Cancel" className="flex h-7 w-7 items-center justify-center rounded-full" style={{ color: SOFT }}>
        <CloseIcon size={10} />
      </button>
    </span>
  );
}

/** The welcome screen's habit pills: each opens its own window (Learn a language stays over every screen). */
export const HABIT_PILLS = [{ key: "language", label: "Learn a language", icon: "🗣" }] as const;
export type HabitPillKey = (typeof HABIT_PILLS)[number]["key"];

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
export const openLanguageWindow = () => window.dispatchEvent(new Event("language-window"));

export function HabitPills({ pills }: { pills: string[] }) {
  const shown = HABIT_PILLS.filter((p) => pills.includes(p.key));
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {shown.map((p) => (
        <button key={p.key} type="button" onClick={openLanguageWindow} className="font-display flex h-9 items-center gap-1.5 rounded-full px-4 text-[15px]" style={GILT}>
          <span aria-hidden>{p.icon}</span>
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** Under a "learn a language" habit: a pill that opens the phrase window. */
export function LanguagePractice() {
  return (
    <div className="ml-11 mt-0.5 pr-2" onPointerDown={(e) => e.stopPropagation()} onKeyDown={stopKeysButSave}>
      <button type="button" onClick={openLanguageWindow} className="inline-flex h-7 w-fit items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold" style={GILT}>
        <span aria-hidden>🗣</span> Practice a phrase
      </button>
    </div>
  );
}

/**
 * The language window: floats over every screen (the welcome screen too), can be
 * minimized to a small 🗣 pill and brought back, or closed. Lives in the root layout,
 * so it stays as you move between screens; remembered across reloads.
 */
type Mode = "open" | "min" | null;
const MODE_KEY = "language-window";
export function LanguageWindow() {
  const [mode, setModeState] = useState<Mode>(null);
  const [ready, setReady] = useState(false);
  const [chipEdit, setChipEdit] = useState(false);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      if (m) window.localStorage.setItem(MODE_KEY, m);
      else window.localStorage.removeItem(MODE_KEY);
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    let m: Mode = null;
    try {
      const v = window.localStorage.getItem(MODE_KEY);
      m = v === "open" || v === "min" ? v : null;
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the window as it was left (browser storage, after hydration)
    setModeState(m);
    setReady(true);
    const open = () => setMode("open");
    window.addEventListener("language-window", open);
    return () => window.removeEventListener("language-window", open);
  }, []);
  if (!ready || !mode) return null;
  // A window you move by its title (on a phone too: the title doesn't scroll the page), minimized to a chip you
  // can name yourself (owner, Nov 3: "Language" with a Japanese character, changed from the gear).
  return (
    <FloatingWindow
      storageKey="language-window-at"
      width={400}
      z={96}
      minimized={mode === "min"}
      onRestore={() => setMode("open")}
      label="Open Learn a language (drag to move)"
      at={() => ({ x: 12, y: Math.max(80, window.innerHeight - 640) })}
      chip={<ChipFace />}
    >
      <div
        role="dialog"
        aria-label="Learn a language"
        data-no-ghost
        className="parchment flex min-h-0 w-full flex-col rounded-2xl"
        style={{ maxHeight: "min(72dvh, 640px)", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", border: "1.5px solid #a88a3f", boxShadow: "0 12px 36px rgba(0,0,0,.4)", color: "#2a1c10" }}
      >
        <div data-drag-handle className="flex cursor-grab touch-none select-none items-center gap-1 px-3 pb-1 pt-2 active:cursor-grabbing" title="Drag to move">
          <h2 className="font-display m-0 flex-1 text-[17px]">🗣 Learn a language</h2>
          <button type="button" onClick={() => setChipEdit((o) => !o)} aria-pressed={chipEdit} aria-label="Settings: the minimized button" title="Settings" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#6b5631", background: chipEdit ? "rgba(217,180,95,.35)" : undefined }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M10.3 2.8h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6-2.6-.5v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <button type="button" onClick={() => setMode("min")} aria-label="Minimize" title="Minimize to a button you can move" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: "#6b5631" }}>
            –
          </button>
          <button type="button" onClick={() => setMode(null)} aria-label="Close" title="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none" style={{ color: "#6b5631" }}>
            <CloseIcon size={12} />
          </button>
        </div>
        {chipEdit && <ChipEditor />}
        <div className="overflow-y-auto overscroll-contain px-3 pb-3">
          <LearnLanguage />
        </div>
      </div>
    </FloatingWindow>
  );
}

const CHIP_KEY = "language-chip";
const CHIP_DEFAULT = { icon: "🈲", label: "Language" };
function readChip(): { icon: string; label: string } {
  try {
    return { ...CHIP_DEFAULT, ...(JSON.parse(window.localStorage.getItem(CHIP_KEY) ?? "null") ?? {}) };
  } catch {
    return CHIP_DEFAULT;
  }
}
function ChipFace() {
  const [c, setC] = useState(CHIP_DEFAULT);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- your chip's name lives in this browser
    setC(readChip());
    const on = () => setC(readChip());
    window.addEventListener("language-chip", on);
    return () => window.removeEventListener("language-chip", on);
  }, []);
  return (
    <>
      <span aria-hidden>{c.icon}</span> {c.label}
    </>
  );
}
/** The minimized button's icon and word, set from the window's gear. */
function ChipEditor() {
  const [c, setC] = useState(readChip);
  const save = (next: { icon: string; label: string }) => {
    setC(next);
    try {
      window.localStorage.setItem(CHIP_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event("language-chip"));
  };
  return (
    <div className="reveal mx-3 mb-2 flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px]" style={{ background: "rgba(255,250,238,.6)", border: "1px dashed rgba(139,112,64,.5)" }}>
      <span className="font-semibold">Minimized button</span>
      <input value={c.icon} onChange={(e) => save({ ...c, icon: [...e.target.value].slice(-2).join("") || CHIP_DEFAULT.icon })} aria-label="Its icon" className="h-8 w-10 rounded-lg border text-center text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.7)" }} />
      <input value={c.label} onChange={(e) => save({ ...c, label: e.target.value.slice(0, 20) })} aria-label="Its word" className="h-8 w-28 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.7)" }} />
      {["🈲", "あ", "語", "🗣", "🌍"].map((x) => (
        <button key={x} type="button" onClick={() => save({ ...c, icon: x })} className="h-8 w-8 rounded-lg text-[15px]" style={{ background: c.icon === x ? "rgba(217,180,95,.45)" : undefined }}>
          {x}
        </button>
      ))}
    </div>
  );
}

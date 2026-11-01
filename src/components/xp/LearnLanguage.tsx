"use client";

import { useState, useTransition } from "react";
import { translatePhraseAction } from "@/app/actions";
import { DEFAULT_LANGUAGES, MORE_LANGUAGES, PHRASE_IDEAS, approxNote, type Translation } from "@/lib/languages";
import { Fold } from "@/components/ui/Fold";

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

/** Learn a language: a phrase, the languages you're learning (all on), and the phrase in each. */
export function LearnLanguage() {
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [phrase, setPhrase] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLang, setNewLang] = useState("");
  const [rows, setRows] = useState<Translation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const on = saved.langs.filter((l) => !saved.off.includes(l));
  const save = (v: Saved) => (setSaved(v), writeSaved(v));
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
  const learn = () =>
    start(async () => {
      setError(null);
      try {
        const r = await translatePhraseAction(phrase, on);
        if (r.error) setError(r.error);
        setRows(r.results.length ? r.results : null);
      } catch {
        setError("The words didn't come this time. Try again in a moment.");
      }
    });
  const listId = "learn-language-list";
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <textarea
        value={phrase}
        onChange={(e) => setPhrase(e.target.value.slice(0, 200))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (phrase.trim()) learn();
          }
        }}
        rows={1}
        placeholder="A phrase to learn…"
        aria-label="A phrase to learn"
        className="w-full resize-none rounded-xl px-3 py-2 text-[16px] leading-snug outline-none"
        style={{ background: "rgba(255,250,238,.75)", border: "1px solid rgba(139,112,64,.4)", color: INK }}
      />
      {/* Ideas: one tap fills the phrase. */}
      <div className="flex flex-wrap gap-1">
        {PHRASE_IDEAS.map((p) => (
          <button key={p} type="button" onClick={() => setPhrase(p)} className="h-7 rounded-full px-2.5 text-[12.5px]" style={phrase === p ? chipOn : { border: "1px solid rgba(139,112,64,.3)", color: SOFT }}>
            {p}
          </button>
        ))}
      </div>
      {/* Languages: all on until you tap one off; + adds another. */}
      <div className="flex flex-wrap items-center gap-1">
        {saved.langs.map((l) => {
          const isOn = !saved.off.includes(l);
          return (
            <button key={l} type="button" role="switch" aria-checked={isOn} onClick={() => toggle(l)} title={approxNote(l) || undefined} className="h-7 rounded-full px-2.5 text-[12.5px] font-semibold" style={isOn ? chipOn : chipOff}>
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={learn}
          disabled={!phrase.trim() || !on.length || busy}
          className="hover-glow h-9 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50"
          style={{ background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", color: "#2a1c10", border: "1px solid #8a6116" }}
        >
          {busy ? "Learning…" : "Learn"}
        </button>
        {rows && (
          <button type="button" onClick={() => printSheet(phrase.trim(), rows)} className="h-9 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.45)", color: "#5a3d12" }}>
            🖨 Print
          </button>
        )}
        {error && (
          <span className="text-[12.5px]" style={{ color: "#8b2c1a" }}>
            {error}
          </span>
        )}
      </div>
      <Fold open={!!rows}>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-1">
          {(rows ?? []).map((r) => (
            <li key={r.language} className="due-in flex items-baseline gap-2 border-b py-1" style={{ borderColor: "rgba(139,112,64,.2)" }}>
              <span className="w-[34%] shrink-0 text-[12.5px] font-semibold" style={{ color: SOFT }} title={r.approx}>
                {r.language}
                {r.approx && <span className="ml-1 text-[11px] font-normal italic">approx.</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] leading-snug [overflow-wrap:anywhere]" style={{ color: INK }}>
                  {r.text}
                </span>
                {r.say && (
                  <span className="block text-[12.5px] italic" style={{ color: SOFT }}>
                    {r.say}
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
      </Fold>
    </div>
  );
}

/** The welcome screen's habit pills: tap one to open it right there. */
export const HABIT_PILLS = [{ key: "language", label: "Learn a language", icon: "🗣" }] as const;
export type HabitPillKey = (typeof HABIT_PILLS)[number]["key"];

export function HabitPills({ pills }: { pills: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = HABIT_PILLS.filter((p) => pills.includes(p.key));
  if (!shown.length) return null;
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {shown.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setOpen((o) => (o === p.key ? null : p.key))}
            aria-expanded={open === p.key}
            className="wheel-btn flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
          >
            <span aria-hidden>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
      <Fold open={open === "language"} className="w-full">
        <LearnLanguage />
      </Fold>
    </div>
  );
}

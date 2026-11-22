import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { FIELD, GILT } from "@/components/xp/welcome/shared";
import { patchFx, type FxSettings } from "@/lib/celebration-fx";
import { cleanXp, journalPrompts, type JournalPrompt } from "@/lib/journal-prompts";
import { saveOrQueue } from "@/lib/offline";
import { useLongPress } from "@/lib/use-long-press";
import { useEffect, useRef, useState } from "react";

/**
 * The welcome screen's Journal (owner, Nov 6): a gilded button that opens a row of prompt pills.
 * Top priorities (the box the app and the toucan remember) is the first and opens by default; the
 * others (morning pages, gratitude…) are a plain page to write on. What's written is saved to your
 * journal by the screen's own button, each prompt paying its XP once a day.
 */
export function WelcomeJournal({ fx, label, icon, priorities, registerJournal, onWritten }: { fx: FxSettings; label?: string; icon?: string; priorities: (question: string, xp: number) => React.ReactNode; registerJournal: (save: () => Promise<boolean>) => void; onWritten: (id: string, xp: number) => void }) {
  const prompts = journalPrompts(fx);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(() => (fx.journalPick && prompts.some((p) => p.id === fx.journalPick) ? fx.journalPick : "priorities"));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const current = prompts.find((p) => p.id === pick) ?? prompts[0];
  const top = prompts.find((p) => p.id === "priorities")!;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [holding, setHolding] = useState<string | null>(null);
  const allShown = !!fx.journalAllPrompts;
  // Two lines of pills unless all are asked for; "Show more prompts" only when there's more to show.
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowFull, setRowFull] = useState(70);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setRowFull(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, prompts.length]);
  const overflows = rowFull > 74;
  const choose = (id: string) => {
    setPick(id);
    setHolding(null);
    patchFx({ journalPick: id });
  };
  const removePrompt = (id: string) => {
    patchFx({ journalPrompts: prompts.filter((p) => p.id !== id), journalPromptsV: 2 });
    if (pick === id) setPick("priorities");
    setHolding(null);
  };
  const addPrompt = (q: string) => {
    const id = `p${Date.now().toString(36)}`;
    const label = q.replace(/[?….:]+$/, "").slice(0, 24) + (q.length > 24 ? "…" : "");
    patchFx({ journalPrompts: [...prompts, { id, label, prompt: q, xp: 5 }], journalPromptsV: 2 });
    choose(id);
  };
  async function save() {
    setError(null);
    try {
      for (const p of prompts) {
        const t = (texts[p.id] ?? "").trim();
        if (p.id === "priorities" || !t || saved[p.id] === t) continue;
        await saveOrQueue("journal", { body: `${p.label}: ${p.prompt}\n\n${t}`, mood: null, kind: null });
        setSaved((s) => ({ ...s, [p.id]: t }));
        onWritten(p.id, cleanXp(p.xp));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your journal.");
      return false;
    }
  }
  // Saved by the screen's own button on the way out (braces: an effect's return value is its cleanup).
  useEffect(() => {
    registerJournal(save);
  });
  const written = prompts.filter((p) => p.id !== "priorities" && (texts[p.id] ?? "").trim()).length;
  return (
    <div className="flex w-full flex-col items-center">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display flex h-10 max-w-full items-center gap-1.5 rounded-full px-5 text-[16px]" style={GILT}>
        <span aria-hidden>{icon || "📖"}</span>
        <span className="shrink-0">{label || "Journal"}</span>
        {/* The prompt chosen, on the button itself (owner, Nov 9). */}
        <span className="min-w-0 truncate text-[14px] italic opacity-85">· {current.label}</span>
        {written > 0 && !open && <span className="shrink-0 font-sans text-[12.5px] font-semibold opacity-80">· {written} written</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform duration-300" style={{ opacity: 0.8, transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="flex w-full flex-col gap-2 pt-2">
          <div className="relative">
            <div
              ref={rowRef}
              role="tablist"
              aria-label="Journal prompts"
              className="flex flex-wrap justify-center gap-1.5 overflow-hidden pr-7 transition-[max-height] duration-300"
              style={{ maxHeight: allShown ? rowFull + 8 : 70 }}
            >
              {prompts.map((p) => (
                <PromptPill key={p.id} p={p} chosen={p.id === current.id} written={p.id !== "priorities" && !!(texts[p.id] ?? "").trim()} onPick={() => choose(p.id)} onHold={() => p.id !== "priorities" && setHolding(p.id)} />
              ))}
              <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-full border border-dashed px-3 text-[13px] font-semibold" style={{ borderColor: "#b39a6a", color: "#6b5631" }}>
                + My own
              </button>
            </div>
            {/* Edit the prompts (names, questions, XP), in place. */}
            <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} aria-label="Edit the journal prompts" title="Edit the prompts" className="absolute right-0 top-0 flex h-8 w-7 items-center justify-center rounded-full" style={{ color: "#8a6a2a", background: editing ? "rgba(217,180,95,.25)" : undefined }}>
              ✎
            </button>
          </div>
          {overflows && (
            <button type="button" onClick={() => patchFx({ journalAllPrompts: !allShown })} className="self-center text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "#6b5631" }}>
              {allShown ? "Fewer prompts ▴" : "Show more prompts ▾"}
            </button>
          )}
          {holding && (
            <div className="reveal flex flex-wrap items-center justify-center gap-2 text-[13px]" style={{ color: "#2a1c10" }}>
              <span>Delete “{prompts.find((p) => p.id === holding)?.label}”?</span>
              <button type="button" onClick={() => removePrompt(holding)} className="h-8 rounded-full px-3 font-semibold" style={{ background: "#b5321f", color: "#fff" }}>
                Delete
              </button>
              <button type="button" onClick={() => setHolding(null)} className="h-8 px-2 underline underline-offset-2" style={{ color: "#6b5631" }}>
                Keep it
              </button>
            </div>
          )}
          {adding && (
            <form
              className="reveal flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
                if (q) addPrompt(q);
                setAdding(false);
              }}
            >
              <input name="q" autoFocus maxLength={240} placeholder="Your own prompt…" aria-label="Your own prompt" className="bare-input fail-reason min-w-0 flex-1 text-[16px]" style={{ color: "#2a1c10" }} />
              <button type="submit" className="h-8 rounded-full px-3 text-[13px] font-bold" style={GILT}>
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className="h-8 px-1 text-[13px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                Cancel
              </button>
            </form>
          )}
          <Fold open={editing}>
            <div className="text-[13px]" style={{ color: "#2a1c10" }}>
              <JournalPromptsEditor key={prompts.map((p) => p.id).join()} fx={fx} />
            </div>
          </Fold>
          {/* Top priorities keeps its own box; it stays mounted so its words are saved even from another pill. */}
          <div hidden={current.id !== "priorities"}>{priorities(top.prompt, cleanXp(top.xp))}</div>
          {current.id !== "priorities" && (
            <div className="flex flex-col gap-1">
              <p className="m-0 text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
                {current.prompt}
              </p>
              <textarea
                key={current.id}
                value={texts[current.id] ?? ""}
                onChange={(e) => setTexts((t) => ({ ...t, [current.id]: e.target.value }))}
                rows={current.id === "pages" ? 7 : 3}
                maxLength={6000}
                placeholder="Write here…"
                aria-label={current.prompt}
                className="w-full resize-y rounded-xl border px-3 py-2 text-[16px] leading-snug focus:outline-none"
                style={FIELD}
              />
              <span className="text-right text-[11.5px]" style={{ color: "#6b5631" }}>
                +{cleanXp(current.xp)} XP once you write · saved with the screen&rsquo;s button
              </span>
            </div>
          )}
          {error && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>
      </Fold>
    </div>
  );
}

/** One prompt pill: tap to write to it, hold (or right-click) to delete it (owner, Nov 9). */
function PromptPill({ p, chosen, written, onPick, onHold }: { p: JournalPrompt; chosen: boolean; written: boolean; onPick: () => void; onHold: () => void }) {
  const lp = useLongPress(onHold);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={chosen}
      {...lp.handlers}
      onClick={() => !lp.wasLong() && onPick()}
      className="h-8 rounded-full px-3 text-[13px] font-semibold"
      style={chosen ? { ...GILT } : { background: "rgba(255,250,238,.6)", border: "1px solid #b39a6a", color: "#2a1c10" }}
    >
      {p.label}
      {written && " ✓"}
    </button>
  );
}

/** The Journal's prompts, edited under its button (right-click or hold it): name, question, XP; add or remove. */
export function JournalPromptsEditor({ fx }: { fx: FxSettings }) {
  const [list, setList] = useState<JournalPrompt[]>(() => journalPrompts(fx));
  const save = (next: JournalPrompt[]) => {
    setList(next);
    patchFx({ journalPrompts: next, journalPromptsV: 2 });
  };
  const edit = (i: number, patch: Partial<JournalPrompt>) => save(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const field = "bare-input h-7 min-w-0 rounded-none border-0 border-b bg-transparent px-1 text-[13.5px] focus:outline-none";
  const line = { borderColor: "#b39a6a", color: "#2a1c10" };
  return (
    <div className="flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
      <span className="font-semibold">Prompts</span>
      {list.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-0.5 rounded-lg px-1.5 py-1" style={{ background: "rgba(255,255,255,.35)" }}>
          <div className="flex items-center gap-1.5">
            <input value={p.label} onChange={(e) => edit(i, { label: e.target.value.slice(0, 30) })} aria-label="Pill name" className={`${field} flex-1 font-semibold`} style={line} />
            <input type="number" inputMode="numeric" min={0} max={50} value={p.xp} onChange={(e) => edit(i, { xp: cleanXp(e.target.value) })} aria-label={`XP for ${p.label}`} className={`${field} w-12 tabular-nums`} style={line} />
            <span>XP</span>
            {p.id !== "priorities" && (
              <button type="button" onClick={() => save(list.filter((_, j) => j !== i))} aria-label={`Remove ${p.label}`} className="flex h-7 w-7 items-center justify-center text-[16px]" style={{ color: "#6b5631" }}>
                <CloseIcon size={10} />
              </button>
            )}
          </div>
          <input value={p.prompt} onChange={(e) => edit(i, { prompt: e.target.value.slice(0, 240) })} aria-label={`What ${p.label} asks`} className={field} style={line} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => save([...list, { id: `p${Date.now().toString(36)}`, label: "New prompt", prompt: "What's on your mind this morning?", xp: 5 }])}
        className="self-start text-[13px] font-semibold underline underline-offset-2"
        style={{ color: "#6b5631" }}
      >
        + Add a prompt
      </button>
    </div>
  );
}

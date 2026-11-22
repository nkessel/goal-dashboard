import { EditButton } from "../WelcomeArrange";
import { setTopPriorityAction } from "@/app/actions";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { FIELD } from "@/components/xp/welcome/shared";
import { CHECKIN_STYLES } from "@/lib/celebration-fx";
import { useEffect, useState } from "react";

/** Your top priorities, in your own words: saved for the day, and kept in mind by the app and the toucan. */
export function TopPriority({ question, register, arranging = false, icon, onFilled }: { last: { text: string; others?: string[]; day: string } | null; question: string; register: (save: () => Promise<boolean>) => void; arranging?: boolean; /** An emoji in place of the target (welcome button editor). */ icon?: string; /** Saved with words in it (for the welcome screen's XP). */ onFilled?: () => void }) {
  // A fresh mind dump every time (owner, Oct 31): nothing carries over into the box.
  const [saved, setSaved] = useState<{ text: string; others: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Secondary priorities (important, not urgent): opened from the button under the box.
  const [othersOpen, setOthersOpen] = useState(false);
  const [others, setOthers] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const filled = others.filter((o) => o.trim());
  const save = async (value: string, more: string[]) => {
    if (!value.trim()) return true;
    setError(null);
    try {
      const r = await setTopPriorityAction(value, more.filter((o) => o.trim()));
      setSaved({ text: r.text, others: r.others });
      onFilled?.();
      setEditing(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      return false;
    } finally {
    }
  };
  // Saved by the screen's own button on the way out (no Save of its own).
  // Braces: returning the saver would make it the effect's cleanup, run on every render.
  useEffect(() => {
    register(() => (saved && !editing ? Promise.resolve(true) : save(text, filled)));
  });
  const edit = () => {
    if (!saved) return;
    setText(saved.text);
    setOthers([...saved.others, ""]);
    setOthersOpen(saved.others.length > 0);
    setEditing(true);
  };
  if (saved && !editing) {
    // One item per line you wrote; long words and links wrap instead of running off the card.
    const lines = saved.text.split("\n").filter((l) => l.trim());
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        {/* While arranging, the part's own name stands in for this label. */}
        {!arranging && (
          <div className="relative flex items-center justify-center">
            <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
              Top priority
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2">
              <EditButton open={false} onClick={edit} label="Change top priority" />
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={edit}
          aria-label={`Top priority: ${lines.join("; ")}. Change`}
          className="font-display flex min-h-[44px] w-full min-w-0 flex-col gap-1.5 rounded-xl px-3 py-2 text-left text-[17px] font-medium leading-snug [overflow-wrap:anywhere] transition-colors hover:bg-[rgba(217,180,95,.12)]"
          style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(179,154,106,.55)", color: "var(--t-ink)" }}
        >
          {lines.map((l, i) => (
            <span key={i} className="flex min-w-0 items-start gap-2">
              {lines.length > 1 && (
                <span aria-hidden className="mt-[.45em] h-2 w-2 shrink-0 rotate-45" style={{ background: "#c9a24a" }} />
              )}
              <span className="min-w-0 flex-1">{l}</span>
            </span>
          ))}
        </button>
        {saved.others.length > 0 && (
          <div className="mt-0.5 flex w-full min-w-0 flex-col gap-0.5 px-1 text-left [overflow-wrap:anywhere]">
            <span className="text-[12px] font-semibold" style={{ color: "#8a6116" }}>
              When there&rsquo;s space
            </span>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {saved.others.map((o, i) => (
                <li key={i} className="flex min-w-0 items-start gap-2 text-[14.5px] leading-snug" style={{ color: "#5a4a30" }}>
                  <span aria-hidden className="mt-[.5em] h-1.5 w-1.5 shrink-0 rotate-45 border" style={{ borderColor: "#b08a3a" }} />
                  <span className="min-w-0 flex-1">{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-1.5 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void save(text, filled);
      }}
    >
      <label htmlFor="welcome-priority" className="flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
        {/* A target beside the question (owner, Nov 5). */}
        {/* A bullseye with an arrow struck in its heart, fletched (owner, Nov 6: "a better target with an arrow sticking out of it"). */}
        {icon ? <span aria-hidden className="text-[18px] leading-none">{icon}</span> : (
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
          <circle cx="12" cy="16" r="10.5" fill="#a3412a" stroke="#5e2414" strokeWidth="1.2" />
          <circle cx="12" cy="16" r="8" fill="#fbf1d6" />
          <circle cx="12" cy="16" r="5.6" fill="#a3412a" />
          <circle cx="12" cy="16" r="3.2" fill="#fbf1d6" />
          <circle cx="12" cy="16" r="1.5" fill="#d9b45f" stroke="#8a6116" strokeWidth=".6" />
          <path d="M12 16 24.2 3.8" stroke="#5a3d17" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M20.4 7.6 24 4 22.8 1.8 19.6 4.6Z" fill="#e8d7a8" stroke="#8a6116" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M20.4 7.6 24 4 26.2 5.2 23.4 8.4Z" fill="#c9a55a" stroke="#8a6116" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M12.6 15.4 10.6 16.2M12.6 15.4 11.8 17.4" stroke="#3a2a14" strokeWidth=".9" strokeLinecap="round" />
        </svg>
        )}
        {question}
      </label>
      <div className="relative pb-4">
        {/* Grows with what you write. */}
        <textarea
          id="welcome-priority"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(260, el.scrollHeight)}px`;
          }}
          maxLength={400}
          rows={2}
          placeholder="What is most important now?"
          className="block min-h-[72px] w-full resize-none rounded-xl px-3 pb-4 pt-2 text-[16px] leading-snug"
          style={FIELD}
        />
        {/* Sits on the box's lower border; opens (and closes) the secondary priorities. */}
        <button
          type="button"
          onClick={() => setOthersOpen((v) => !v)}
          aria-expanded={othersOpen}
          className="font-display absolute bottom-0 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px]"
          style={CHECKIN_STYLES[0].style}
        >
          {othersOpen ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5.5 15l6.5-6.5 6.5 6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span aria-hidden className="text-[16px] leading-none">+</span>
          )}
          Other priorities{filled.length && !othersOpen ? ` (${filled.length})` : ""}
        </button>
      </div>
      <Fold open={!!othersOpen}>
        <div className="mx-auto flex w-[65%] min-w-[220px] flex-col items-center gap-1">
          {others.map((o, i) => (
            <div key={i} className="flex w-full items-center gap-1">
              <input
                autoFocus={i === others.length - 1 && !o}
                value={o}
                onChange={(e) => {
                  const v = e.target.value;
                  setOthers((all) => {
                    const next = all.map((x, j) => (j === i ? v : x));
                    // Writing in the last box brings a fresh one below it.
                    if (i === next.length - 1 && v.trim() && next.length < 8) next.push("");
                    return next;
                  });
                }}
                maxLength={160}
                placeholder={i === 0 ? "e.g. Call Mom about the visit, by Sunday" : "Another"}
                aria-label={`Secondary priority ${i + 1}`}
                className="h-9 min-w-0 flex-1 rounded-full px-3 text-[16px]"
                style={FIELD}
              />
              {o && (
                <button type="button" onClick={() => setOthers((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [""]))} aria-label="Remove" className="h-9 w-6 shrink-0 text-[16px]" style={{ color: "#6b5631" }}>
                  <CloseIcon size={10} />
                </button>
              )}
            </div>
          ))}
          <span className="text-center text-[12px] leading-snug" style={{ color: "#6b5631" }}>
            <b>Secondary Priorities</b> · important, not urgent. Add a due date or anything else the toucan should know, and he&rsquo;ll bring them up when there&rsquo;s space.
          </span>
        </div>
      </Fold>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </form>
  );
}

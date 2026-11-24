import { EnergyCheck } from "../EnergyCheck";
import { type FxSettings } from "@/lib/celebration-fx";
import { pickFor } from "@/lib/welcome";
import { useState } from "react";

export function LineVote({ kind, on, onClick }: { kind: "like" | "dislike"; on: boolean; onClick: () => void }) {
  const like = kind === "like";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={like ? "I like this line: show it more" : "I don't like this line: don't show it again"}
      title={like ? "Like: show it more often" : "Dislike: never show it again"}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-opacity before:absolute before:-inset-2 before:content-[''] hover:opacity-100 ${on ? "opacity-100" : "opacity-45"}`}
      style={{ background: on ? (like ? "rgba(120,170,80,.22)" : "rgba(192,80,58,.16)") : "transparent" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden style={like ? undefined : { transform: "rotate(180deg)" }}>
        <path d="M7 10v10H4V10h3zm2 10h8.2a2 2 0 0 0 2-1.6l1.3-6.5A2 2 0 0 0 18.5 9.5H14l.8-4a1.6 1.6 0 0 0-2.9-1.2L9 9v11z" fill={on ? (like ? "#4f7a30" : "#93402c") : "none"} stroke={on ? (like ? "#4f7a30" : "#93402c") : "#8a6116"} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** One of your reflection questions: the same one all day, ‹ › for another. */
export function ReflectLine({ questions }: { questions: string[] }) {
  const [start] = useState(() => questions.indexOf(pickFor(new Date().toDateString(), questions)));
  const [i, setI] = useState(0);
  const q = questions[(((start + i) % questions.length) + questions.length) % questions.length];
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[.1em]" style={{ color: "#8a6116" }}>
        To reflect on
      </span>
      <div className="flex w-full items-center justify-center gap-1.5">
        {questions.length > 1 && (
          <button type="button" onClick={() => setI((n) => n - 1)} aria-label="Another question" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "#8a6116" }}>
            ‹
          </button>
        )}
        <p key={q} className="due-in m-0 font-display text-[16.5px] italic leading-snug" style={{ color: "var(--t-ink)" }}>
          {q}
        </p>
        {questions.length > 1 && (
          <button type="button" onClick={() => setI((n) => n + 1)} aria-label="Next question" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "#8a6116" }}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}

/** The check-in, slid open under its button (sleep has its own part now). */
export function CheckinPanel({ fx, metrics, onSaved, submit }: { fx: FxSettings; metrics: string[]; onSaved: () => void; submit: (save: (after: () => void) => void) => void }) {
  return (
    <div
      className="mt-2 w-full rounded-2xl px-2 py-2.5 text-left"
      style={{
        background: "linear-gradient(180deg, rgba(255,250,236,.75), rgba(240,226,190,.75))",
        border: "1.5px solid rgba(139,112,64,.5)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)",
        ["--t-cream" as string]: "var(--t-ink)",
        ["--ec-soft" as string]: "var(--t-ink-soft)",
        ["--ec-chip" as string]: "rgba(120,90,40,.1)",
        ["--ec-gold" as string]: "#8a6116",
        ["--ec-line" as string]: "rgba(139,112,64,.45)",
        ["--ec-value" as string]: "#5a3d12",
        ["--ec-l" as string]: "30%",
      }}
    >
      <p className="m-0 mb-1.5 text-center text-[14.5px] italic" style={{ color: "#5a4420" }}>
        How are you arriving today?
      </p>
      <EnergyCheck full={fx.welcomeMetrics !== false} noSleep today={null} metrics={metrics} onSaved={onSaved} submit={submit} simple />
    </div>
  );
}

"use client";

// The day's wise line on the welcome screen: ‹ › for more, quiet thumbs and a note (split plan W5). Its state lives in
// `useWiseLine`, called by WelcomeCard, so it lasts while the screen is being arranged (the part is drawn anew there).
import { useState } from "react";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import { likeLine, likedLines, lineForDay, retireLine } from "@/lib/greetings";
import { LineVote } from "./Lines";

export function useWiseLine(line: string | null) {
  // Your verdict on the day's wise line: liked lines come back often, disliked ones never.
  const [verdict, setVerdict] = useState<"like" | "dislike" | null>(() => (line && typeof window !== "undefined" && likedLines().has(line) ? "like" : null));
  // More wise lines with ‹ › (the day's line first; each › brings one you haven't seen this visit).
  const [moreLines, setMoreLines] = useState<string[]>([]);
  const [lineAt, setLineAt] = useState(0);
  const shownLine = lineAt === 0 ? line : (moreLines[lineAt - 1] ?? line);
  const stepLine = (d: number) => {
    let next = lineAt + d;
    if (next < 0) return;
    if (next > moreLines.length) {
      const seen = new Set([line, ...moreLines]);
      let pick = "";
      for (let i = 0; i < 12 && (!pick || seen.has(pick)); i++) pick = lineForDay(`more-${line}-${moreLines.length}-${i}`);
      if (!pick || seen.has(pick)) return;
      setMoreLines((m) => [...m, pick]);
      next = moreLines.length + 1;
    }
    const to = next === 0 ? line : (moreLines[next - 1] ?? null);
    setLineAt(next);
    setVerdict(to && likedLines().has(to) ? "like" : null);
    setLineWhy(null);
  };
  // Thumbs down asks why; the speech bubble beside the thumbs takes any other note.
  const [lineWhy, setLineWhy] = useState<"down" | "note" | null>(null);
  const [lineSaid, setLineSaid] = useState<string | null>(null);
  // Phones: the ✎ and thumbs wait until you tap the words (no tools always showing).
  const [lineTools, setLineTools] = useState(false);
  return { shownLine, lineAt, stepLine, verdict, setVerdict, lineWhy, setLineWhy, lineSaid, setLineSaid, lineTools, setLineTools };
}

export function WiseLine({ shownLine, lineAt, stepLine, verdict, setVerdict, lineWhy, setLineWhy, lineSaid, setLineSaid, lineTools, setLineTools }: ReturnType<typeof useWiseLine> & { shownLine: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-0.5">
      {/* ‹ › either side for more wise lines (owner, Nov 5); quiet thumbs right after the line's last word. */}
      <div className="flex w-full items-center gap-1">
      <button type="button" onClick={() => stepLine(-1)} disabled={lineAt === 0} aria-label="The wise line before" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[18px] leading-none disabled:opacity-25" style={{ color: "#8a6a2c" }}>
        ‹
      </button>
      <p onClick={(e) => !(e.target as HTMLElement).closest("button") && setLineTools((v) => !v)} className={`m-0 text-center text-[16px] leading-snug [text-wrap:pretty] ${verdict === "dislike" ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
        {shownLine}
        <span data-show={lineTools || !!lineWhy ? "true" : "false"} className="touch-tools ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle no-underline" style={{ textDecoration: "none" }}>
          <LineVote kind="like" on={verdict === "like"} onClick={() => (likeLine(shownLine, verdict !== "like"), setVerdict(verdict === "like" ? null : "like"), setLineSaid(verdict === "like" ? "Taken back" : "Saved: it'll come back more often"))} />
          <LineVote kind="dislike" on={verdict === "dislike"} onClick={() => (retireLine(shownLine, verdict !== "dislike"), setVerdict(verdict === "dislike" ? null : "dislike"), setLineWhy(verdict === "dislike" ? null : "down"), setLineSaid(verdict === "dislike" ? "It's back in the rotation" : "Got it: it won't come back"))} />
          <NoteButton on={lineWhy === "note"} onClick={() => setLineWhy((w) => (w === "note" ? null : "note"))} />
        </span>
      </p>
      <button type="button" onClick={() => stepLine(1)} aria-label="Another wise line" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: "#8a6a2c" }}>
        ›
      </button>
      </div>
      {/* Every press says it landed. */}
      <Confirm text={lineSaid} onDone={() => setLineSaid(null)} />
      {lineWhy && <WhyBox key={lineWhy} saying={shownLine} source="Wise line" down={lineWhy === "down"} onDone={(sent) => (setLineWhy(null), sent && setLineSaid("Thanks, your feedback was sent"))} />}
    </div>
  );
}

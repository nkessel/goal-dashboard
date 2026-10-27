import Link from "next/link";

type Kind = "week" | "month" | "pair" | "pair-mid";

/**
 * The people and things waiting for a time: a nudge on Today until each is
 * on the calendar.
 */
export function ScheduleNudge({ titles }: { titles: string[] }) {
  const n = titles.length;
  const named = titles.slice(0, 2).map((t) => (t.length > 34 ? `${t.slice(0, 33)}…` : t));
  const rest = n - named.length;
  return (
    <Link href="/calendar?view=week&auto=1" className="hover-glow parchment parchment-framed flex items-center gap-3 rounded-2xl px-4 py-3">
      <span aria-hidden className="relative z-[1] text-[26px]">📅</span>
      <span className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[18px]" style={{ color: "#3b2a14" }}>
          {n === 1 ? "1 thing is waiting for a time" : `${n} things are waiting for a time`}
        </span>
        <span className="truncate text-[13.5px]" style={{ color: "#6b5631" }}>
          {named.join(" · ")}
          {rest > 0 ? ` · +${rest} more` : ""} — tap to find {n === 1 ? "it" : "them"} a time
        </span>
      </span>
      <span aria-hidden className="relative z-[1] text-[20px]" style={{ color: "#8a6116" }}>→</span>
    </Link>
  );
}

/** A gentle invitation to a planning ritual (yours, or the check-in with your partner). */
export function PlanNudge({ kind, started, partner = "Mom" }: { kind: Kind; started: boolean; partner?: string }) {
  const href = kind === "week" ? "/plan" : kind === "month" ? "/plan?mode=month" : kind === "pair" ? "/plan?mode=mom" : "/plan?mode=mom&mid=1";
  const title =
    kind === "pair"
      ? started
        ? `Finish your check-in with ${partner}`
        : `Weekly check-in with ${partner}`
      : kind === "pair-mid"
        ? `Midweek check-in with ${partner}`
        : started
          ? `Finish planning your ${kind}`
          : kind === "week"
            ? "Plan the week ahead"
            : "A new month — plan it";
  const sub =
    kind === "pair"
      ? started
        ? "The mind sweep, the calendar, and closing it · +40 XP"
        : "About 45 minutes, equal time each · +40 XP"
      : kind === "pair-mid"
        ? "Ten minutes: one win, what's next, what help you could use"
        : kind === "week"
          ? "Look back, check your wheel of life, empty your head, pick 3 big rocks · +30 XP"
          : "Life wheel, focus, outcomes and key dates · +60 XP";
  return (
    <Link href={href} className="hover-glow parchment parchment-framed flex items-center gap-3 rounded-2xl px-4 py-3">
      <span aria-hidden className="relative z-[1] text-[26px]">{kind.startsWith("pair") ? "🤝" : "🗺"}</span>
      <span className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[18px]" style={{ color: "#3b2a14" }}>
          {title}
        </span>
        <span className="text-[13.5px]" style={{ color: "#6b5631" }}>
          {sub}
        </span>
      </span>
      <span aria-hidden className="relative z-[1] text-[20px]" style={{ color: "#8a6116" }}>→</span>
    </Link>
  );
}

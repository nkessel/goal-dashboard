import Link from "next/link";

/** A gentle invitation to the weekly or monthly planning ritual. */
export function PlanNudge({ kind, started }: { kind: "week" | "month"; started: boolean }) {
  return (
    <Link
      href={kind === "week" ? "/plan" : "/plan?mode=month"}
      className="hover-glow parchment parchment-framed flex items-center gap-3 rounded-2xl px-4 py-3"
    >
      <span aria-hidden className="relative z-[1] text-[26px]">🗺</span>
      <span className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[18px]" style={{ color: "#3b2a14" }}>
          {started ? `Finish planning your ${kind}` : kind === "week" ? "Plan the week ahead" : "A new month — plan it"}
        </span>
        <span className="text-[13.5px]" style={{ color: "#6b5631" }}>
          {kind === "week" ? "Look back, empty your head, pick 3 big rocks, put them on the calendar · +30 XP" : "Life wheel, focus, outcomes and key dates · +60 XP"}
        </span>
      </span>
      <span aria-hidden className="relative z-[1] text-[20px]" style={{ color: "#8a6116" }}>→</span>
    </Link>
  );
}

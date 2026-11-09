/**
 * A cut gem: the mark on Reward tags (owner, Nov 9: "the wrong kind of diamond"; a brilliant-cut
 * diamond by default, and each reward can wear its own).
 */
export type GemKind = "diamond" | "ruby" | "emerald" | "ink";

export const GEMS: { kind: GemKind; label: string; fill: string; edge: string; light: string }[] = [
  { kind: "diamond", label: "Diamond", fill: "#9fd6e8", edge: "#2c4a5a", light: "#dff4fb" },
  { kind: "ruby", label: "Ruby", fill: "#d2414a", edge: "#5a1418", light: "#f59aa0" },
  { kind: "emerald", label: "Emerald", fill: "#3fa36b", edge: "#16402a", light: "#a8e6c0" },
  { kind: "ink", label: "Ink", fill: "none", edge: "currentColor", light: "none" },
];

export const isGemKind = (v: unknown): v is GemKind => GEMS.some((g) => g.kind === v);

export function Gem({ kind = "diamond", size = 13 }: { kind?: GemKind | null; size?: number }) {
  const g = GEMS.find((x) => x.kind === kind) ?? GEMS[0];
  const ink = g.kind === "ink";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d="M6.5 4h11l4 5.2L12 21 2.5 9.2z" fill={g.fill} stroke={g.edge} strokeWidth={ink ? 1.8 : 1.4} strokeLinejoin="round" />
      <path d="M2.5 9.2h19M8.5 9.2L12 21l3.5-11.8M6.5 4l2 5.2L12 4l3.5 5.2 2-5.2" stroke={g.edge} strokeWidth={ink ? 1.2 : 1} strokeLinejoin="round" />
      {!ink && <path d="M8.5 9.2L12 4l3.5 5.2z" fill={g.light} />}
    </svg>
  );
}

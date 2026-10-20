/**
 * The quest map's icons, drawn in the app's inked-gold style: destinations
 * at the top of the road, and markers for the steps already taken.
 */

export type GoalIcon = "castle" | "summit" | "chest" | "tree" | "lighthouse" | "hearth";
export type DoneIcon = "check" | "flag" | "star" | "gem";

export const GOAL_ICONS: { key: GoalIcon; label: string }[] = [
  { key: "castle", label: "Castle" },
  { key: "summit", label: "Summit" },
  { key: "chest", label: "Treasure" },
  { key: "tree", label: "Great tree" },
  { key: "lighthouse", label: "Lighthouse" },
  { key: "hearth", label: "Home" },
];
export const DONE_ICONS: { key: DoneIcon; label: string }[] = [
  { key: "check", label: "Seal" },
  { key: "flag", label: "Flag" },
  { key: "star", label: "Star" },
  { key: "gem", label: "Gem" },
];

const INK = "#3b2a14";
const GOLD = "#e2bb5c";
const GOLD_D = "#a8812e";

export function GoalGlyph({ icon, size = 56, glow = false }: { icon: GoalIcon; size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden style={glow ? { filter: "drop-shadow(0 0 10px rgba(242,210,126,.9))" } : undefined}>
      {icon === "castle" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M10 58V30h8v-6h6v6h4V22h8v8h4v-6h6v6h8v28z" fill="#d8c39a" />
          <path d="M28 58V46a4 4 0 0 1 8 0v12" fill="#6e4423" />
          <path d="M32 22V8" strokeLinecap="round" />
          <path d="M32 8l10 3-10 3z" fill="#b5321f" />
          <path d="M14 38h4M46 38h4" strokeLinecap="round" />
        </g>
      )}
      {icon === "summit" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M4 58l20-34 8 12 6-8 22 30z" fill="#9aa7b8" />
          <path d="M24 24l6 9-3 3-3-4-4 5-3-3z" fill="#f4f1ea" />
          <path d="M38 28V10" strokeLinecap="round" />
          <path d="M38 10l11 4-11 4z" fill={GOLD} />
        </g>
      )}
      {icon === "chest" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M10 30h44v26H10z" fill="#8a5a30" />
          <path d="M10 30c0-10 8-16 22-16s22 6 22 16z" fill="#a8703c" />
          <path d="M10 38h44" />
          <path d="M28 34h8v10h-8z" fill={GOLD} />
          <path d="M20 12l2 4M44 12l-2 4M32 6v6" stroke={GOLD_D} strokeLinecap="round" />
        </g>
      )}
      {icon === "tree" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M29 58V40h6v18" fill="#6e4423" />
          <path d="M32 6c-12 0-20 8-20 18 0 4 2 7 4 9-3 3-3 9 2 11 4 2 9 0 10-2 2 2 6 2 8 0 1 2 6 4 10 2 5-2 5-8 2-11 2-2 4-5 4-9 0-10-8-18-20-18z" fill="#5f8a4a" />
          <circle cx="24" cy="22" r="2.2" fill={GOLD} stroke="none" />
          <circle cx="40" cy="28" r="2.2" fill={GOLD} stroke="none" />
          <circle cx="33" cy="16" r="2.2" fill={GOLD} stroke="none" />
        </g>
      )}
      {icon === "lighthouse" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M24 58l4-36h8l4 36z" fill="#f4f1ea" />
          <path d="M25.6 44h12.8M26.8 33h10.4" stroke="#b5321f" strokeWidth="4" />
          <path d="M26 22h12v-8H26z" fill={GOLD} />
          <path d="M24 14h16l-8-6z" fill="#b5321f" />
          <path d="M42 17l14-5M42 19h15M22 17L8 12M22 19H7" stroke={GOLD_D} strokeLinecap="round" />
          <path d="M14 58h36" />
        </g>
      )}
      {icon === "hearth" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M10 30L32 10l22 20v28H10z" fill="#d8c39a" />
          <path d="M6 32L32 8l26 24" fill="none" strokeLinecap="round" />
          <path d="M42 18V10h6v14" fill="#8a5a30" />
          <path d="M26 58V42h12v16" fill="#6e4423" />
          <path d="M16 36h8v7h-8z" fill={GOLD} />
          <path d="M45 6c2 2 0 3 1 5" stroke="#9aa7b8" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** What a finished step shows: drawn over a gold disc. */
export function DoneGlyph({ icon, size = 26 }: { icon: DoneIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {icon === "check" && <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3b2a10" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />}
      {icon === "flag" && (
        <g stroke="#3b2a10" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M7 21V4" strokeLinecap="round" />
          <path d="M7 4.5h10l-2.5 3.8L17 12H7z" fill="#b5321f" />
        </g>
      )}
      {icon === "star" && <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="#fff6cf" stroke="#3b2a10" strokeWidth="1.6" strokeLinejoin="round" />}
      {icon === "gem" && (
        <g stroke="#3b2a10" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M7 5h10l4 5-9 10L3 10z" fill="#5fb3c9" />
          <path d="M3 10h18M9 5l3 15 3-15" fill="none" />
        </g>
      )}
    </svg>
  );
}

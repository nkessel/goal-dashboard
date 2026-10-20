/**
 * The quest map's icons, drawn in the app's inked-gold style: destinations
 * at the top of the road, and markers for the steps already taken.
 */

export type GoalIcon = "castle" | "summit" | "chest" | "tree" | "lighthouse" | "hearth" | "temple" | "windmill" | "campfire" | "crown" | "portal" | "garden";
export type DoneIcon = "check" | "flag" | "star" | "gem" | "leaf" | "heart" | "lantern" | "footprint";
/** What stands at your next step, showing where you are on the road. */
export type MarkerIcon = "portrait" | "lantern" | "banner" | "compass" | "none";

export const GOAL_ICONS: { key: GoalIcon; label: string }[] = [
  { key: "castle", label: "Castle" },
  { key: "summit", label: "Summit" },
  { key: "chest", label: "Treasure" },
  { key: "tree", label: "Great tree" },
  { key: "lighthouse", label: "Lighthouse" },
  { key: "hearth", label: "Home" },
  { key: "temple", label: "Temple" },
  { key: "windmill", label: "Windmill" },
  { key: "campfire", label: "Campfire" },
  { key: "crown", label: "Crown" },
  { key: "portal", label: "Moon gate" },
  { key: "garden", label: "Garden" },
];
export const DONE_ICONS: { key: DoneIcon; label: string }[] = [
  { key: "check", label: "Seal" },
  { key: "flag", label: "Flag" },
  { key: "star", label: "Star" },
  { key: "gem", label: "Gem" },
  { key: "leaf", label: "Leaf" },
  { key: "heart", label: "Heart" },
  { key: "lantern", label: "Lantern" },
  { key: "footprint", label: "Footprints" },
];
export const MARKER_ICONS: { key: MarkerIcon; label: string }[] = [
  { key: "portrait", label: "You" },
  { key: "lantern", label: "Lantern" },
  { key: "banner", label: "Banner" },
  { key: "compass", label: "Compass" },
  { key: "none", label: "None" },
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
      {icon === "temple" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M8 22L32 8l24 14z" fill="#b5321f" />
          <path d="M12 22h40v5H12z" fill="#d8c39a" />
          <path d="M16 27v24M26 27v24M38 27v24M48 27v24" strokeWidth="4" stroke="#f4f1ea" />
          <path d="M16 27v24M26 27v24M38 27v24M48 27v24" strokeWidth="1" />
          <path d="M8 51h48v7H8z" fill="#d8c39a" />
          <circle cx="32" cy="16" r="2.5" fill={GOLD} />
        </g>
      )}
      {icon === "windmill" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M24 58l3-30h10l3 30z" fill="#d8c39a" />
          <path d="M29 58v-8a3 3 0 0 1 6 0v8" fill="#6e4423" />
          <path d="M32 24L14 10l-3 4zM32 24l18-14 3 4zM32 24L18 40l-4-3zM32 24l14 16 4-3z" fill="#f4f1ea" />
          <circle cx="32" cy="24" r="3" fill={GOLD} />
        </g>
      )}
      {icon === "campfire" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M14 54l36-10M14 44l36 10" stroke="#6e4423" strokeWidth="5" strokeLinecap="round" />
          <path d="M32 46c-9 0-12-7-9-14 2-5 6-7 5-14 6 4 12 10 13 17 1-3 0-6 0-8 4 4 5 8 4 12-1 4-5 7-13 7z" fill="#e8742a" />
          <path d="M32 46c-4 0-6-3-5-7 1-3 3-4 3-8 4 3 7 7 6 11-1 3-2 4-4 4z" fill="#ffd36b" stroke="none" />
          <path d="M18 14l1 3M46 10l-1 3M40 20l2 2" stroke={GOLD_D} strokeLinecap="round" />
        </g>
      )}
      {icon === "crown" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M10 46L6 18l14 12 12-18 12 18 14-12-4 28z" fill={GOLD} />
          <path d="M10 46h44v8H10z" fill={GOLD_D} />
          <circle cx="32" cy="34" r="4" fill="#b5321f" />
          <circle cx="19" cy="38" r="2.6" fill="#5fb3c9" />
          <circle cx="45" cy="38" r="2.6" fill="#5fb3c9" />
          <circle cx="6" cy="18" r="2.4" fill="#fff6cf" />
          <circle cx="32" cy="12" r="2.4" fill="#fff6cf" />
          <circle cx="58" cy="18" r="2.4" fill="#fff6cf" />
        </g>
      )}
      {icon === "portal" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M10 58V30a22 22 0 0 1 44 0v28h-8V30a14 14 0 0 0-28 0v28z" fill="#9aa7b8" />
          <path d="M18 58V30a14 14 0 0 1 28 0v28z" fill="#2e3a6e" />
          <path d="M36 26a7 7 0 1 1-7-9 5.5 5.5 0 0 0 7 9z" fill="#fff6cf" />
          <circle cx="25" cy="40" r="1.2" fill="#fff6cf" stroke="none" />
          <circle cx="38" cy="46" r="1.2" fill="#fff6cf" stroke="none" />
          <circle cx="30" cy="52" r="1" fill="#fff6cf" stroke="none" />
        </g>
      )}
      {icon === "garden" && (
        <g stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <path d="M8 58V36a24 24 0 0 1 48 0v22" fill="none" stroke="#5f8a4a" strokeWidth="5" />
          <path d="M8 58V36a24 24 0 0 1 48 0v22" fill="none" />
          <circle cx="12" cy="30" r="3" fill="#e58aa0" />
          <circle cx="22" cy="16" r="3" fill="#ffd36b" />
          <circle cx="42" cy="16" r="3" fill="#e58aa0" />
          <circle cx="52" cy="30" r="3" fill="#ffd36b" />
          <path d="M32 58V40" stroke="#5f8a4a" strokeWidth="2.4" />
          <path d="M32 40c-4-6 0-10 0-10s4 4 0 10zM32 46c-6 0-8-4-8-4s5-2 8 4zM32 46c6 0 8-4 8-4s-5-2-8 4z" fill="#7aa35e" />
          <path d="M18 58h28" />
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
      {icon === "leaf" && (
        <g stroke="#3b2a10" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z" fill="#7aa35e" />
          <path d="M5 19L14 10" strokeLinecap="round" />
        </g>
      )}
      {icon === "heart" && <path d="M12 20s-7.5-4.6-7.5-10A4.1 4.1 0 0 1 12 7.6 4.1 4.1 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="#c8453a" stroke="#3b2a10" strokeWidth="1.6" strokeLinejoin="round" />}
      {icon === "lantern" && (
        <g stroke="#3b2a10" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M9 3.5h6M12 3.5v2" strokeLinecap="round" />
          <path d="M8 6.5h8l1 3v7l-1 3H8l-1-3v-7z" fill="#ffd36b" />
          <path d="M12 10c-1.4 1.6-1.4 3.4 0 4.6 1.4-1.2 1.4-3 0-4.6z" fill="#e8742a" stroke="none" />
        </g>
      )}
      {icon === "footprint" && (
        <g fill="#3b2a10">
          <ellipse cx="8.5" cy="14.5" rx="2.6" ry="4" />
          <circle cx="7" cy="8.6" r="1.1" />
          <circle cx="9.4" cy="8.2" r="1" />
          <ellipse cx="15.5" cy="10" rx="2.6" ry="4" />
          <circle cx="14" cy="4.2" r="1.1" />
          <circle cx="16.4" cy="3.8" r="1" />
        </g>
      )}
    </svg>
  );
}

/** The marker standing at your next step. */
export function MarkerGlyph({ icon, size = 30, portrait }: { icon: MarkerIcon; size?: number; portrait?: string | null }) {
  if (icon === "none") return null;
  if (icon === "portrait")
    return portrait ? (
      // eslint-disable-next-line @next/next/no-img-element -- the traveller's own portrait
      <img src={portrait} alt="" draggable={false} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size, border: "2.5px solid #f6dc8e", boxShadow: "0 3px 8px rgba(0,0,0,.45)", background: "#2a1c10" }} />
    ) : (
      <MarkerGlyph icon="banner" size={size} />
    );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,.4))" }}>
      {icon === "lantern" && (
        <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 4h8M16 4v3" strokeLinecap="round" />
          <path d="M10 8h12l1.5 4v10L22 26H10l-1.5-4V12z" fill="#ffd36b" />
          <path d="M16 13c-2 2.2-2 4.8 0 6.4 2-1.6 2-4.2 0-6.4z" fill="#e8742a" stroke="none" />
          <path d="M9 26h14" strokeLinecap="round" />
        </g>
      )}
      {icon === "banner" && (
        <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M9 30V3" strokeLinecap="round" />
          <path d="M9 4h16l-4 5 4 5H9z" fill="#b5321f" />
          <circle cx="9" cy="3" r="1.8" fill={GOLD} />
        </g>
      )}
      {icon === "compass" && (
        <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
          <circle cx="16" cy="16" r="12" fill="#f4f1ea" />
          <circle cx="16" cy="16" r="9" fill="none" stroke={GOLD_D} />
          <path d="M16 6l3 10h-6z" fill="#b5321f" />
          <path d="M16 26l-3-10h6z" fill="#3b2a14" />
          <circle cx="16" cy="16" r="1.6" fill={GOLD} />
        </g>
      )}
    </svg>
  );
}

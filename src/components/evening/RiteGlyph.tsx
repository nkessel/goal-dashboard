import { useId } from "react";

/**
 * Small flat pictures for evening rites and mini-quests, chosen from the
 * rite's kind or its title (a heart for checking in with a partner, a shirt
 * for laying out clothes, an eye for envisioning tomorrow…). Falls back to
 * the moon.
 */

export type GlyphKey =
  | "list123"
  | "calendar"
  | "heart"
  | "shirt"
  | "eye"
  | "book"
  | "quill"
  | "sparkle"
  | "stretch"
  | "lotus"
  | "shoe"
  | "bed"
  | "tooth"
  | "glass"
  | "phone"
  | "pill"
  | "bag"
  | "plant"
  | "moon";

const RULES: [RegExp, GlyphKey][] = [
  [/calendar/i, "calendar"],
  [/tiffany|partner|spouse|wife|husband|couple|check.?in with|love/i, "heart"],
  [/cloth|outfit|shirt|wear|dress/i, "shirt"],
  [/envision|imagine|visuali[sz]e|picture tomorrow|dream/i, "eye"],
  [/gratitude|grateful|thank|journal|write|diary/i, "quill"],
  [/read|book|chapter|study/i, "book"],
  [/kitchen|tidy|clean|dish|declutter|laundry/i, "sparkle"],
  [/stretch|yoga|mobility/i, "stretch"],
  [/meditat|breath|pray|calm/i, "lotus"],
  [/walk|run|exercise|workout|gym/i, "shoe"],
  [/bed|sleep|lights out|wind down/i, "bed"],
  [/teeth|floss|brush/i, "tooth"],
  [/water|drink|hydrat/i, "glass"],
  [/phone|screen|device|charge/i, "phone"],
  [/vitamin|pill|medic|supplement/i, "pill"],
  [/pack|bag|lunch for/i, "bag"],
  [/plant|garden|water the/i, "plant"],
  [/plan tomorrow|schedule|calendar/i, "calendar"],
];

export function glyphFor(r: { kind?: string | null; title: string }): GlyphKey {
  if (r.kind === "tomorrow") return "list123";
  // Swapped at the owner's request: preparing tomorrow wears the heart, a calendar check-in the calendar.
  if (r.kind === "plan") return "heart";
  for (const [re, key] of RULES) if (re.test(r.title)) return key;
  return "moon";
}

const INK = "#3a3148";

export function RiteGlyph({ kind, size = 26 }: { kind: GlyphKey; size?: number }) {
  const s = { stroke: INK, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (kind) {
    case "list123":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <text x="1.6" y="8.6" fontSize="7.8" fontWeight="800" fill={INK} fontFamily="Georgia, serif">1</text>
          <text x="1.4" y="15.4" fontSize="7.8" fontWeight="800" fill={INK} fontFamily="Georgia, serif">2</text>
          <text x="1.4" y="22.2" fontSize="7.8" fontWeight="800" fill={INK} fontFamily="Georgia, serif">3</text>
          <path d="M9.6 6.2h11M9.6 12.9h11M9.6 19.6h8" {...s} strokeWidth={2.2} />
        </svg>
      );
    case "calendar":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" {...s} />
          <path d="M3.5 9.6h17" {...s} />
          <path d="M8 3v4M16 3v4" {...s} strokeWidth={2.1} />
          <rect x="6.6" y="12" width="3" height="2.6" rx=".6" fill={INK} />
          <rect x="10.6" y="12" width="3" height="2.6" rx=".6" fill={INK} opacity=".45" />
          <rect x="14.6" y="12" width="3" height="2.6" rx=".6" fill={INK} opacity=".45" />
          <rect x="6.6" y="15.8" width="3" height="2.6" rx=".6" fill={INK} opacity=".45" />
        </svg>
      );
    case "heart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 20.4S3.2 15.1 3.2 9.3c0-2.7 2-4.7 4.5-4.7 1.8 0 3.3 1 4.3 2.6 1-1.6 2.5-2.6 4.3-2.6 2.5 0 4.5 2 4.5 4.7 0 5.8-8.8 11.1-8.8 11.1z" fill="#c8402f" stroke="#5a1a10" strokeWidth="1.2" strokeLinejoin="round" />
          <ellipse cx="7.7" cy="8.4" rx="1.6" ry="1" transform="rotate(-30 7.7 8.4)" fill="#fff" opacity=".55" />
        </svg>
      );
    case "shirt":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M8.6 3.8 3.4 6.6l1.9 4.2 2.3-1v10.4h8.8V9.8l2.3 1 1.9-4.2-5.2-2.8c-.5 1.5-1.8 2.4-3.4 2.4s-2.9-.9-3.4-2.4z" {...s} />
        </svg>
      );
    case "eye":
      // Flat black and white.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12z" fill="#fff" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3.9" fill="#111" />
          <circle cx="13.4" cy="10.6" r="1.1" fill="#fff" />
        </svg>
      );
    case "book":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 6.4C10.2 5 7.6 4.5 3.5 4.8v13.6c4.1-.3 6.7.2 8.5 1.6 1.8-1.4 4.4-1.9 8.5-1.6V4.8C16.4 4.5 13.8 5 12 6.4zM12 6.4V20" {...s} />
        </svg>
      );
    case "quill":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M20 3.5C13 4.2 8.2 9 6.4 16.2l1.6.5C9 14 10.7 12.2 13 11.2c-1.3 1.4-2.3 3-2.9 4.9 5.2-.7 8.7-5.6 9.9-12.6z" {...s} />
          <path d="M6.4 16.2 4 20.5" {...s} />
        </svg>
      );
    case "sparkle":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6zM17.5 13l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" {...s} strokeWidth={1.6} />
        </svg>
      );
    case "stretch":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="4.6" r="2" fill={INK} />
          <path d="M4 8.4l8 1.6 8-1.6M12 10v4.6l-4.2 6M12 14.6l4.2 6" {...s} strokeWidth={2} />
        </svg>
      );
    case "lotus":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 17.8c-2.4-1.6-3.6-4-3.6-6.6 0-2.4 1.4-4.6 3.6-6.4 2.2 1.8 3.6 4 3.6 6.4 0 2.6-1.2 5-3.6 6.6zM12 17.8c-3.3.3-6.6-1.2-8.6-4.4 2.4-.9 4.4-.8 6.2.2M12 17.8c3.3.3 6.6-1.2 8.6-4.4-2.4-.9-4.4-.8-6.2.2M5 20.2h14" {...s} />
        </svg>
      );
    case "shoe":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M3.5 17.5V8.2l4 .6c.8 1.9 2.4 3 4.6 3.3l5.4.9c1.9.4 3 1.6 3 3.2v1.3zM3.5 17.5v2h17.5v-2" {...s} />
        </svg>
      );
    case "bed":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M3 18.5V6.5M3 14h18v4.5M21 14v-2.4c0-1.6-1.3-2.9-2.9-2.9H11v5.3" {...s} />
          <circle cx="7" cy="11.4" r="1.9" {...s} />
        </svg>
      );
    case "tooth":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M7.6 3.8c1.6 0 2.6.8 4.4.8s2.8-.8 4.4-.8c2.6 0 3.9 2.5 3.4 5.6-.4 2.2-1.4 3.4-1.8 5.6-.5 2.7-.9 5.4-2.3 5.4-1.6 0-1.2-4.6-3.7-4.6s-2.1 4.6-3.7 4.6c-1.4 0-1.8-2.7-2.3-5.4-.4-2.2-1.4-3.4-1.8-5.6-.5-3.1.8-5.6 3.4-5.6z" {...s} />
        </svg>
      );
    case "glass":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M5.5 3.5h13l-1.6 16.2c-.1.9-.8 1.5-1.7 1.5H8.8c-.9 0-1.6-.6-1.7-1.5zM6.4 11h11.2" {...s} />
        </svg>
      );
    case "phone":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4" {...s} />
          <path d="M10.6 17.8h2.8" {...s} />
        </svg>
      );
    case "pill":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="2.6" y="8.2" width="18.8" height="7.6" rx="3.8" transform="rotate(-40 12 12)" {...s} />
          <path d="M9.6 9.4l5 5.2" {...s} transform="rotate(5 12 12)" />
        </svg>
      );
    case "bag":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M5 8h14l-1 12.2H6zM9 8V6.4a3 3 0 0 1 6 0V8" {...s} />
        </svg>
      );
    case "plant":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 14v-4M12 10c0-3 2-5 5.5-5 0 3.3-2 5-5.5 5zM12 11.5c0-2.6-1.8-4.4-4.8-4.4 0 2.9 1.8 4.4 4.8 4.4zM7 14h10l-1.3 6.2H8.3z" {...s} />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" fill="#efe6c6" stroke="#6f6a8a" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
  }
}

/**
 * The trophy for "Celebrate today's wins": an illustrated reward-style
 * portrait (a gold cup on a beaming golden ground).
 */
export function TrophyAvatar({ size = 52 }: { size?: number }) {
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="tr-bg" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#fff6d2" />
          <stop offset=".45" stopColor="#f2cf6e" />
          <stop offset="1" stopColor="#a8741c" />
        </radialGradient>
        <linearGradient id="tr-cup" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".4" stopColor="#f0c04a" />
          <stop offset="1" stopColor="#a86d10" />
        </linearGradient>
        <clipPath id="tr-clip">
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#tr-bg)" />
      <g clipPath="url(#tr-clip)" opacity=".55">
        {rays.map((a) => (
          <path key={a} d="M32 32 L30.4 0 L33.6 0 Z" fill="#fff8dc" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <g stroke="#5a3a08" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M21 17.5c-6 0-7.4 4.4-6.4 7.4 1.2 3.6 5 5.4 8.6 5.6M43 17.5c6 0 7.4 4.4 6.4 7.4-1.2 3.6-5 5.4-8.6 5.6" fill="none" strokeWidth="2.6" />
        <path d="M20.5 14h23v4.5c0 8.6-4.7 14-11.5 14s-11.5-5.4-11.5-14z" fill="url(#tr-cup)" />
        <path d="M29 32h6v6.4h-6z" fill="url(#tr-cup)" />
        <path d="M24 38.4h16l1.6 5.4H22.4z" fill="url(#tr-cup)" />
        <rect x="20" y="43.8" width="24" height="5" rx="1.4" fill="#7a4f12" />
      </g>
      <path d="M32 17.6l1.5 3.2 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z" fill="#fffbe6" stroke="#8a5a10" strokeWidth=".7" />
      <path d="M24 16.5c.3 5 1.6 8.5 4 10.8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".7" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#5a4520" strokeWidth="2" />
    </svg>
  );
}

/** Each picture's colours for its medallion: light, middle, deep. */
const PALETTE: Record<GlyphKey, [string, string, string]> = {
  list123: ["#fff6d2", "#f2cf6e", "#a8741c"],
  calendar: ["#fff2d6", "#f0b860", "#a0581c"],
  heart: ["#ffe1e6", "#f08aa0", "#9c2e4c"],
  shirt: ["#e3f1ff", "#86b9ec", "#2f5f9a"],
  eye: ["#efe4ff", "#b49af0", "#5a3c9e"],
  book: ["#dff6f0", "#7fcdb8", "#2a7a66"],
  quill: ["#fff0d8", "#e9b672", "#8e5a1e"],
  sparkle: ["#e0fbff", "#86dcec", "#2a8296"],
  stretch: ["#e8f8dc", "#9ad27a", "#42802a"],
  lotus: ["#f6e6ff", "#d4a2ec", "#7a3c9a"],
  shoe: ["#ffe9d8", "#f2a36a", "#a3501c"],
  bed: ["#e3e6ff", "#9aa3ec", "#3a428e"],
  tooth: ["#e4fff6", "#92e2c6", "#2f8a6c"],
  glass: ["#e2f4ff", "#7cc4f0", "#226a9c"],
  phone: ["#eceff4", "#a8b2c4", "#4a5468"],
  pill: ["#ffe6de", "#f29a86", "#a03c2a"],
  bag: ["#f8ecd8", "#d8b282", "#86602e"],
  plant: ["#e6f8de", "#8fcf72", "#3a7a28"],
  moon: ["#e8e6ff", "#a6a2e0", "#3c3880"],
};

/**
 * An illustrated medallion for a main evening rite: a glowing disc in the
 * picture's colours with soft rays, a gilt rim and the picture large in the
 * middle — the same family as the wins trophy.
 */
export function RiteMedallion({ kind, size = 52 }: { kind: GlyphKey; size?: number }) {
  const id = useId().replace(/:/g, "");
  const [light, mid, deep] = PALETTE[kind];
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="absolute inset-0">
        <defs>
          <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="62%">
            <stop offset="0" stopColor={light} />
            <stop offset=".5" stopColor={mid} />
            <stop offset="1" stopColor={deep} />
          </radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff2b8" />
            <stop offset=".45" stopColor="#d9b45f" />
            <stop offset="1" stopColor="#7a5414" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx="32" cy="32" r="29" />
          </clipPath>
        </defs>
        <circle cx="32" cy="32" r="29" fill={`url(#${id}-bg)`} />
        <g clipPath={`url(#${id}-clip)`} opacity=".4">
          {rays.map((a) => (
            <path key={a} d="M32 32 L29.6 0 L34.4 0 Z" fill="#fffbe8" transform={`rotate(${a} 32 32)`} />
          ))}
        </g>
        <circle cx="32" cy="32" r="18" fill="#fffaf0" opacity=".55" />
        <path d="M14 22a20 20 0 0 1 16-12" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".6" />
        <circle cx="32" cy="32" r="29.5" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="3" />
        <circle cx="32" cy="32" r="31" fill="none" stroke="#4a3410" strokeWidth=".8" opacity=".6" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center" style={{ filter: "drop-shadow(0 1px 0 rgba(255,255,255,.8)) drop-shadow(0 2px 3px rgba(0,0,0,.25))" }}>
        {kind === "moon" ? <MedallionMoon size={Math.round(size * 0.5)} /> : <RiteGlyph kind={kind} size={Math.round(size * 0.52)} />}
      </span>
    </span>
  );
}

function MedallionMoon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" fill="#f6e7b0" stroke="#3a3148" strokeWidth="1.3" />
      <circle cx="11" cy="14" r="1.1" fill="#c9ad5a" />
      <circle cx="14.5" cy="17.5" r=".8" fill="#c9ad5a" />
    </svg>
  );
}

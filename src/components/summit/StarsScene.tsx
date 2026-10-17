import { wobble } from "./art";

/**
 * The Constellation: a deep night from a lonely hilltop. The Milky Way
 * arches overhead, nebulae glow in rose and teal, and high above waits a
 * great crescent moon — the boss. Today's quests are stars; the lines
 * between them are a constellation of your own making.
 */
const CX = 600;
export const STARS_GOAL = { x: CX + 205, y: 176 };

const FIELD = Array.from({ length: 420 }, (_, i) => {
  // Dense along the band of the Milky Way, sparse elsewhere.
  const t = wobble(i + 3);
  const along = t * 1700 - 50;
  const band = 520 - along * 0.32 + (wobble(i + 50) - 0.5) * (i % 3 === 0 ? 520 : 150);
  return { x: along, y: band, r: 0.3 + Math.pow(wobble(i + 17), 3) * 1.6, d: wobble(i + 9) * 5 };
});

export function StarsScene() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03040f" />
          <stop offset=".35" stopColor="#0b0b2a" />
          <stop offset=".7" stopColor="#1d1446" />
          <stop offset=".9" stopColor="#3a2458" />
          <stop offset="1" stopColor="#5a3560" />
        </linearGradient>
        <filter id="st-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id="st-blur-s" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <radialGradient id="st-moon-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff7dc" stopOpacity=".55" />
          <stop offset=".4" stopColor="#d9d0ff" stopOpacity=".18" />
          <stop offset="1" stopColor="#a8a0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="st-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120d24" />
          <stop offset="1" stopColor="#05040c" />
        </linearGradient>
      </defs>

      <rect width="1600" height="800" fill="url(#st-sky)" />
      {/* the Milky Way and nebulae */}
      <g opacity=".9">
        <path d="M-80 560C300 420 900 260 1700 40" stroke="#8c94e8" strokeWidth="190" opacity=".16" fill="none" filter="url(#st-blur)" />
        <path d="M-80 560C300 420 900 260 1700 40" stroke="#e8d9ff" strokeWidth="60" opacity=".14" fill="none" filter="url(#st-blur-s)" />
        <path d="M-80 580C320 450 880 300 1700 70" stroke="#05040c" strokeWidth="14" opacity=".35" fill="none" filter="url(#st-blur-s)" />
        <ellipse cx="300" cy="300" rx="220" ry="90" fill="#d0508a" opacity=".16" filter="url(#st-blur)" />
        <ellipse cx="1280" cy="200" rx="240" ry="100" fill="#3fb8c4" opacity=".14" filter="url(#st-blur)" />
        <ellipse cx={CX + 120} cy="380" rx="200" ry="80" fill="#7a5ad8" opacity=".16" filter="url(#st-blur)" />
      </g>
      <g className="summit-stars">
        {FIELD.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 11 === 0 ? "#ffe3c2" : i % 7 === 0 ? "#cfe0ff" : "#fff"} opacity=".9" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>
      {/* a shooting star now and then */}
      <path className="stars-shoot" d="M1200 90l-140 60" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0" />

      {/* the great crescent moon */}
      <g transform={`translate(${CX + 205} 176)`}>
        <circle r="150" fill="url(#st-moon-glow)" className="summit-crown" />
        <circle r="62" fill="none" stroke="#efe6ff" strokeWidth=".8" opacity=".25" />
        <circle r="78" fill="none" stroke="#efe6ff" strokeWidth=".6" strokeDasharray="2 6" opacity=".22" />
        <mask id="st-crescent">
          <circle r="40" fill="#fff" />
          <circle cx="18" cy="-12" r="36" fill="#000" />
        </mask>
        <circle r="40" fill="#fff6dc" mask="url(#st-crescent)" />
        <circle r="40" fill="#fff6dc" opacity=".06" />
      </g>

      {/* the lonely hill, a tree on it, the horizon glowing */}
      <path d="M0 740Q300 690 600 716T1060 700T1600 726V800H0Z" fill="#170f2c" />
      <path d={`M${CX - 220} 800Q${CX - 40} 728 ${CX + 200} 736T${CX + 640} 800Z`} fill="url(#st-hill)" />
      <g transform={`translate(${CX + 40} 742)`} fill="#05040c">
        <path d="M0 0l-2-46" stroke="#05040c" strokeWidth="4" strokeLinecap="round" />
        <path d="M-2 -30l-16-12M-1 -38l14-10M-2 -46l-8-12" stroke="#05040c" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="-14" cy="-50" rx="16" ry="10" />
        <ellipse cx="8" cy="-56" rx="18" ry="11" />
        <ellipse cx="-4" cy="-66" rx="14" ry="9" />
        <ellipse cx="16" cy="-46" rx="10" ry="7" />
      </g>
      <g stroke="#05040c" strokeWidth="1.2" strokeLinecap="round">
        {Array.from({ length: 60 }, (_, i) => {
          const x = CX - 180 + i * 12 + wobble(i) * 8;
          const y = 742 - Math.sin((i / 60) * Math.PI) * 10;
          return <path key={i} d={`M${x} ${y + 6}q${(wobble(i + 2) - 0.5) * 4} -6 ${(wobble(i + 4) - 0.5) * 6} ${-6 - wobble(i + 6) * 7}`} />;
        })}
      </g>
    </svg>
  );
}

/** Wisps of nebula over the upper sky: the way to the moon is glimpsed through them. */
export function StarsVeil() {
  const wisp = (x: number, y: number, rx: number, ry: number, c: string, o: number, cls: string, d: number) => (
    <ellipse key={`${x}${y}`} className={cls} style={{ animationDelay: `${d}s` }} cx={x} cy={y} rx={rx} ry={ry} fill={c} opacity={o} filter="url(#sv-blur)" />
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <filter id="sv-blur" x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      {wisp(CX + 140, 250, 170, 34, "#b88ae8", 0.42, "summit-cloud-a", 0)}
      {wisp(CX + 280, 300, 150, 30, "#6fd0d8", 0.32, "summit-cloud-b", 2)}
      {wisp(CX + 120, 350, 200, 36, "#e08ab8", 0.3, "summit-cloud-a", 4)}
      {wisp(CX + 260, 200, 120, 26, "#9aa8ff", 0.34, "summit-cloud-b", 1)}
    </svg>
  );
}

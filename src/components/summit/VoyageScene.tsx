import { wobble } from "./art";

/**
 * The Voyage: a night sea under a rising moon. A silver road of moonlight on
 * the water, far islands on the horizon, and — out past the fog — the
 * lighthouse that is the boss, its beam sweeping the dark.
 */
const CX = 600;
export const VOYAGE_GOAL = { x: CX + 205, y: 296 };
const HORIZON = 372;

const STARS = Array.from({ length: 170 }, (_, i) => ({ x: wobble(i + 2) * 1600, y: Math.pow(wobble(i + 91), 1.4) * 330, r: 0.35 + wobble(i + 13) * 1.1, d: wobble(i + 7) * 4 }));

export function VoyageScene() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="vy-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050920" />
          <stop offset=".22" stopColor="#0f1a44" />
          <stop offset=".38" stopColor="#24356b" />
          <stop offset=".45" stopColor="#5b5f8f" />
          <stop offset=".47" stopColor="#a68ea6" />
        </linearGradient>
        <linearGradient id="vy-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d3d70" />
          <stop offset=".25" stopColor="#1a2752" />
          <stop offset="1" stopColor="#070d24" />
        </linearGradient>
        <radialGradient id="vy-moon-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f4f1ff" stopOpacity=".7" />
          <stop offset=".3" stopColor="#c9d4ff" stopOpacity=".25" />
          <stop offset="1" stopColor="#8fa0e0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vy-moon" cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#e8e6f6" />
          <stop offset="1" stopColor="#c4c2e0" />
        </radialGradient>
        <linearGradient id="vy-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff3c8" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff3c8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="vy-lamp" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffbe0" stopOpacity="1" />
          <stop offset=".35" stopColor="#ffe08a" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffd28a" stopOpacity="0" />
        </radialGradient>
        <filter id="vy-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="vy-blur1" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      <rect width="1600" height="800" fill="url(#vy-sky)" />
      {/* the milky way, faint */}
      <path d="M-50 260C300 120 700 40 1650 -30" stroke="#b8c4ff" strokeWidth="90" opacity=".07" filter="url(#vy-blur)" fill="none" />
      <g className="summit-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity=".9" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>

      {/* the moon */}
      <circle cx={CX + 330} cy="232" r="210" fill="url(#vy-moon-glow)" />
      <circle cx={CX + 330} cy="232" r="44" fill="url(#vy-moon)" />
      <g fill="#b9b6d6" opacity=".35">
        <circle cx={CX + 318} cy="222" r="8" />
        <circle cx={CX + 344} cy="246" r="5" />
        <circle cx={CX + 340} cy="214" r="3.5" />
        <circle cx={CX + 312} cy="250" r="4" />
      </g>

      {/* far islands */}
      <path d={`M0 ${HORIZON}L60 360Q120 340 170 362L260 ${HORIZON}L1000 ${HORIZON}L1090 358Q1150 330 1230 356L1300 364Q1350 350 1420 366L1600 ${HORIZON}V${HORIZON + 4}H0Z`} fill="#141b3d" />

      {/* the lighthouse on its rock, far out */}
      <g transform={`translate(${CX + 205} 0)`}>
        <path d={`M-48 ${HORIZON + 2}Q-34 352 -14 350Q6 346 22 354Q40 356 52 ${HORIZON + 2}Z`} fill="#10162f" />
        <path d="M-7 352L-5 304L5 304L7 352Z" fill="#e9e4f4" />
        <path d="M-6.2 338h12.4M-5.6 322h11.2" stroke="#b33a48" strokeWidth="5" />
        <path d="M-8 304h16v-3h-16z" fill="#2a2f50" />
        <rect x="-4" y="292" width="8" height="9" fill="#fff2b8" />
        <path d="M-6 292l6-6 6 6z" fill="#2a2f50" />
        <circle cx="0" cy="296" r="26" fill="url(#vy-lamp)" className="summit-crown" />
        {/* the sweeping beam */}
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-170 0 296;-10 0 296;-170 0 296" dur="16s" repeatCount="indefinite" />
          <path d="M0 296L520 262L520 330Z" fill="url(#vy-beam)" filter="url(#vy-blur1)" />
        </g>
      </g>

      {/* the sea */}
      <rect y={HORIZON} width="1600" height={800 - HORIZON} fill="url(#vy-sea)" />
      {/* a road of moonlight on the water */}
      <g className="voyage-glitter" fill="#eef0ff">
        {Array.from({ length: 70 }, (_, i) => {
          const t = i / 70;
          const y = HORIZON + 6 + Math.pow(t, 1.6) * (800 - HORIZON);
          const spread = 18 + t * 170;
          const x = CX + 330 + (wobble(i + 3) - 0.5) * spread * 2;
          const len = 6 + t * 40 * wobble(i + 8);
          return <rect key={i} x={x - len / 2} y={y} width={len} height={0.8 + t * 2} rx="1" opacity={0.25 + 0.6 * wobble(i + 21) * (1 - t * 0.5)} style={{ animationDelay: `${wobble(i) * 3}s` }} />;
        })}
      </g>
      {/* swells */}
      <g stroke="#7f92cf" fill="none" strokeLinecap="round">
        {Array.from({ length: 46 }, (_, i) => {
          const t = i / 46;
          const y = HORIZON + 14 + Math.pow(t, 1.5) * (800 - HORIZON - 20);
          const x = wobble(i + 40) * 1600;
          const len = 20 + t * 120;
          return <path key={i} d={`M${x} ${y}q${len / 2} ${-3 - t * 6} ${len} 0`} strokeWidth={0.6 + t * 1.4} opacity={0.18 + t * 0.2} />;
        })}
      </g>

      {/* rocks framing the near water */}
      <path d="M0 640Q60 610 120 630Q170 600 230 650L260 800H0Z" fill="#0b1124" />
      <path d="M0 640Q60 610 120 630" stroke="#5b6aa8" strokeWidth="1.5" fill="none" opacity=".5" />
      <path d="M1600 610Q1530 590 1470 620Q1420 600 1370 650L1340 800H1600Z" fill="#0b1124" />
      <path d={`M${CX - 30} 700Q${CX + 20} 676 ${CX + 60} 700L${CX + 40} 800H${CX - 60}Z`} fill="#0b1124" />
      <path d={`M${CX + 360} 690Q${CX + 400} 668 ${CX + 440} 694L${CX + 460} 800H${CX + 340}Z`} fill="#0b1124" />
      {/* the jetty the voyage sets out from */}
      <g transform={`translate(${CX + 200} 0)`}>
        <path d="M-26 760L-14 800H14L26 760Z" fill="#3a2a1c" />
        <path d="M-26 760H26" stroke="#5a412a" strokeWidth="3" />
        <path d="M-20 772H20M-17 784H17" stroke="#2a1d12" strokeWidth="1.5" />
        <rect x="-30" y="752" width="4" height="40" fill="#2a1d12" />
        <rect x="26" y="752" width="4" height="40" fill="#2a1d12" />
        <circle cx="-28" cy="748" r="9" fill="url(#vy-lamp)" className="wanderer-lantern" />
      </g>
    </svg>
  );
}

/** Fog banks over the water: the way to the lighthouse is half-lost in them. */
export function VoyageVeil() {
  const bank = (x: number, y: number, w: number, h: number, o: number, cls: string, d: number) => (
    <ellipse key={`${x}${y}`} className={cls} style={{ animationDelay: `${d}s` }} cx={x} cy={y} rx={w} ry={h} fill="url(#vv-fog)" opacity={o} filter="url(#vv-blur)" />
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <radialGradient id="vv-fog" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#c9d0f0" stopOpacity=".95" />
          <stop offset="1" stopColor="#c9d0f0" stopOpacity="0" />
        </radialGradient>
        <filter id="vv-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {bank(CX + 150, 360, 260, 22, 0.75, "summit-cloud-a", 0)}
      {bank(CX + 300, 384, 220, 20, 0.65, "summit-cloud-b", 2)}
      {bank(CX + 60, 404, 260, 26, 0.7, "summit-cloud-a", 4)}
      {bank(CX + 250, 430, 300, 24, 0.55, "summit-cloud-b", 1)}
      {bank(CX + 120, 456, 280, 20, 0.45, "summit-cloud-a", 3)}
      {bank(300, 380, 320, 24, 0.5, "summit-cloud-b", 2)}
      {bank(1320, 390, 320, 24, 0.5, "summit-cloud-a", 5)}
    </svg>
  );
}

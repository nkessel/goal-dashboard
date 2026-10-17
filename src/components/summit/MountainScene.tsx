/**
 * The painted world behind the summit view: a dawn sky, a far range, the
 * great peak (its top is the level boss), misty foothills and a dark pine
 * forest in front. Drawn 1600×800, anchored to the bottom and centre, so a
 * phone sees the middle and a wide screen sees the whole range.
 */
export const SCENE_W = 1600;
export const SCENE_H = 800;
/** The middle 400 units hold the peak; the rest widens the world. */
const CX = 600;
/** The very top of the peak, in scene units. */
export const SUMMIT = { x: CX + 205, y: 132 };
export const SCENE_ASPECT = "xMidYMax slice";

function pine(x: number, base: number, h: number, fill: string, edge?: string) {
  const w = h * 0.42;
  const tiers = 4;
  let d = "";
  for (let i = 0; i < tiers; i++) {
    const top = base - h + (i * h) / (tiers + 0.6);
    const bot = top + h * 0.42;
    const ww = (w * (0.45 + (i / tiers) * 0.55)) / 2;
    d += `M${x} ${top.toFixed(1)}L${(x + ww).toFixed(1)} ${bot.toFixed(1)}L${(x - ww).toFixed(1)} ${bot.toFixed(1)}Z`;
  }
  return (
    <g key={`${x}-${base}-${h}`}>
      <rect x={x - h * 0.025} y={base - h * 0.12} width={h * 0.05} height={h * 0.12} fill="#1a120b" />
      <path d={d} fill={fill} />
      {edge && <path d={d} fill="none" stroke={edge} strokeWidth=".8" opacity=".35" />}
    </g>
  );
}

const STARS = Array.from({ length: 130 }, (_, i) => ({ x: (i * 397) % 1600, y: (i * 53) % 200, r: 0.5 + ((i * 7) % 3) * 0.35, d: (i % 6) * 0.6 }));

export function MountainScene() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio={SCENE_ASPECT} aria-hidden>
      <defs>
        <linearGradient id="ms-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141a3a" />
          <stop offset=".3" stopColor="#3b2f63" />
          <stop offset=".5" stopColor="#a8678a" />
          <stop offset=".62" stopColor="#f2a979" />
          <stop offset=".72" stopColor="#ffd9a3" />
        </linearGradient>
        <radialGradient id="ms-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3c8" stopOpacity=".95" />
          <stop offset=".35" stopColor="#ffd28a" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffb070" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ms-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b86b8" />
          <stop offset="1" stopColor="#c9a7b8" />
        </linearGradient>
        <linearGradient id="ms-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c7b3c9" />
          <stop offset=".5" stopColor="#8a7aa3" />
          <stop offset="1" stopColor="#5a5480" />
        </linearGradient>
        <linearGradient id="ms-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a4470" />
          <stop offset="1" stopColor="#2c2a4c" />
        </linearGradient>
        <linearGradient id="ms-snow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#ffe9dc" />
          <stop offset="1" stopColor="#c9c3e6" />
        </linearGradient>
        <linearGradient id="ms-hills" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3e5a6a" />
          <stop offset="1" stopColor="#253c45" />
        </linearGradient>
        <linearGradient id="ms-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6b45" />
          <stop offset=".5" stopColor="#2a4d31" />
          <stop offset="1" stopColor="#16301d" />
        </linearGradient>
        <linearGradient id="ms-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4ea" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff4ea" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff4ea" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ms-crown" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff1b8" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffd28a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky and dawn */}
      <rect width="1600" height="800" fill="url(#ms-sky)" />
      <g className="summit-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity=".8" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>
      <circle cx={CX + 205} cy="300" r="260" fill="url(#ms-sun)" />

      {/* the wide world: distant ranges either side */}
      <path d="M0 470L60 400L120 430L190 340L250 400L320 360L400 420L470 380L560 440L600 480L1000 480L1060 420L1120 450L1200 360L1270 410L1340 350L1410 420L1480 380L1550 430L1600 410V520H0Z" fill="url(#ms-far)" opacity=".8" />
      <path d="M0 520L90 450L160 480L260 410L360 470L460 430L600 500L1000 500L1120 440L1220 480L1320 420L1440 470L1530 440L1600 470V560H0Z" fill="#6e6a98" opacity=".75" />

      <g transform={`translate(${CX} 0)`}>

      {/* the great peak */}
      <path d="M205 132L178 172L156 206L132 250L104 300L70 356L30 418L-80 520L-200 580L620 580L520 520L430 460L382 402L334 332L292 268L262 214L236 178Z" fill="url(#ms-lit)" />
      <path d="M205 132L236 178L262 214L292 268L334 332L382 402L430 460L520 520L620 580L212 580L200 430L216 360L198 290L214 214Z" fill="url(#ms-shade)" />
      <path d="M205 132L182 168L166 192L176 196L186 186L192 204L204 192L214 214L224 198L236 210L246 198L254 206L236 178Z" fill="url(#ms-snow)" />
      <path d="M132 250l18 8 10-14M262 214l-6 14 14 4M104 300l22 6M292 268l-10 16 16 2" stroke="#efe6f4" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".5" />
      {/* a glow at the top, where the boss waits */}
      <circle className="summit-crown" cx="205" cy="132" r="26" fill="url(#ms-crown)" />
      </g>

      {/* misty foothills with distant pines */}
      <path d="M0 530Q160 470 330 500T640 492Q720 470 810 492T1060 486T1320 500T1600 492V640H0Z" fill="url(#ms-hills)" />
      {Array.from({ length: 34 }, (_, i) => 20 + i * 47).map((x, i) => pine(x, 512 + (i % 3) * 7, 24 + (i % 4) * 6, "#20343c"))}
      <rect x="-40" y="440" width="1680" height="150" fill="url(#ms-mist)" className="summit-mist" />

      {/* the forest floor */}
      <path d="M0 610Q200 560 420 585T800 572T1180 586T1600 576V820H0Z" fill="url(#ms-meadow)" />
      {/* forest: thickest at the far edges, a fringe each side of the middle */}
      {[[CX + 8, 610, 60], [CX + 34, 622, 74], [CX + 372, 612, 64], [CX + 394, 630, 80], [CX + 62, 640, 54], [CX + 346, 646, 58], [120, 600, 70], [240, 615, 60], [360, 605, 66], [470, 620, 58], [1130, 612, 62], [1250, 600, 72], [1380, 618, 60], [1500, 604, 70]].map(([x, b, hh]) => pine(x, b, hh, "#1c3a26", "#6fa36f"))}
      {[[CX - 6, 720, 150], [CX + 30, 760, 190], [CX + 392, 730, 160], [CX + 420, 780, 220], [CX + 76, 800, 120], [CX + 330, 812, 140], [60, 760, 220], [180, 800, 260], [330, 780, 200], [470, 760, 180], [1110, 770, 190], [1260, 790, 240], [1400, 760, 210], [1530, 800, 260]].map(([x, b, hh]) => pine(x, b, hh, "#0f2418", "#4f8a5a"))}
      {[[CX - 10, 860, 300], [CX + 418, 870, 320], [20, 880, 380], [1590, 880, 380]].map(([x, b, hh]) => pine(x, b, hh, "#0a1a11"))}
      {/* fireflies */}
      {[[CX + 120, 700], [CX + 270, 660], [CX + 90, 610], [CX + 320, 740], [CX + 200, 640], [CX + 150, 760], [300, 690], [1300, 680], [450, 650], [1150, 720]].map(([x, y], i) => (
        <circle key={i} className="summit-firefly" cx={x} cy={y} r="1.6" fill="#fff3a0" style={{ animationDelay: `${i * 0.7}s` }} />
      ))}
    </svg>
  );
}

/**
 * Drifting clouds over the climb — drawn above the dotted way up, so the
 * route to the summit is glimpsed but never quite seen.
 */
export function MountainClouds() {
  const cloud = (x: number, y: number, s: number, o: number, cls: string, delay: number) => (
    <g key={`${x}-${y}`} className={cls} style={{ animationDelay: `${delay}s` }} opacity={o}>
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="0" cy="0" rx="46" ry="14" fill="#fff6f0" />
        <ellipse cx="-22" cy="-8" rx="22" ry="14" fill="#fff6f0" />
        <ellipse cx="10" cy="-13" rx="26" ry="17" fill="#fffaf6" />
        <ellipse cx="34" cy="-5" rx="18" ry="11" fill="#fff6f0" />
        <ellipse cx="0" cy="5" rx="50" ry="8" fill="#e9d6e6" opacity=".7" />
      </g>
    </g>
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio={SCENE_ASPECT} aria-hidden>
      <g transform={`translate(${CX} 0)`}>
      {cloud(250, 210, 1.1, 0.88, "summit-cloud-a", 0)}
      {cloud(150, 285, 1.35, 0.92, "summit-cloud-b", 2)}
      {cloud(285, 350, 1.25, 0.85, "summit-cloud-a", 4)}
      {cloud(110, 410, 1.6, 0.9, "summit-cloud-b", 1)}
      {cloud(300, 455, 1.5, 0.8, "summit-cloud-a", 3)}
      {cloud(190, 505, 1.9, 0.7, "summit-cloud-b", 5)}
      </g>
      {cloud(180, 260, 1.4, 0.75, "summit-cloud-a", 2)}
      {cloud(1420, 230, 1.5, 0.75, "summit-cloud-b", 3)}
    </svg>
  );
}

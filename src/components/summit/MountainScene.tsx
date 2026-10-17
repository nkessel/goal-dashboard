import { Birds, Pines, Rays, wobble } from "./art";

/**
 * The painted world behind the summit view, at golden hour: a deep sky
 * warming to gold at the horizon, the sun breaking behind the great peak in
 * long rays, ranges fading into haze, alpenglow on the snow, a glowing mist
 * in the valley and a dark pine forest in front, rim-lit by the sunset.
 * Drawn 1600×800, anchored to the bottom and centre, so a phone sees the
 * middle and a wide screen sees the whole range.
 */
export const SCENE_W = 1600;
export const SCENE_H = 800;
/** The middle 400 units hold the peak; the rest widens the world. */
const CX = 600;
/** The very top of the peak, in scene units. */
export const SUMMIT = { x: CX + 205, y: 118 };
export const SCENE_ASPECT = "xMidYMax slice";

const STARS = Array.from({ length: 150 }, (_, i) => ({ x: wobble(i + 1) * 1600, y: Math.pow(wobble(i + 77), 1.6) * 230, r: 0.4 + wobble(i + 33) * 1.1, d: wobble(i + 5) * 4 }));

/** A distant range as one silhouette, from a list of ridge heights. */
function range(peaks: number[], base: number, step: number, x0 = -40) {
  let d = `M${x0} ${base}`;
  peaks.forEach((y, i) => {
    const x = x0 + i * step;
    d += `L${x + step * 0.5} ${y}L${x + step} ${y + (base - y) * (0.25 + wobble(i + y) * 0.35)}`;
  });
  return d + `L${x0 + peaks.length * step + 40} ${base + 400}L${x0} ${base + 400}Z`;
}

export function MountainScene() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio={SCENE_ASPECT} aria-hidden>
      <defs>
        <linearGradient id="ms-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0e2a" />
          <stop offset=".2" stopColor="#1f1b4f" />
          <stop offset=".36" stopColor="#4c2f6e" />
          <stop offset=".46" stopColor="#9a4f7c" />
          <stop offset=".54" stopColor="#e07a6e" />
          <stop offset=".6" stopColor="#f6a65f" />
          <stop offset=".66" stopColor="#ffd38a" />
          <stop offset=".72" stopColor="#fff0c4" />
        </linearGradient>
        <radialGradient id="ms-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
          <stop offset=".12" stopColor="#fff0bf" stopOpacity=".9" />
          <stop offset=".35" stopColor="#ffc779" stopOpacity=".42" />
          <stop offset="1" stopColor="#ff9a5c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ms-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9b0" stopOpacity="0" />
          <stop offset="1" stopColor="#ffd9b0" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="ms-r1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c58fa6" />
          <stop offset="1" stopColor="#e6b2a6" />
        </linearGradient>
        <linearGradient id="ms-r2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8d6d9c" />
          <stop offset="1" stopColor="#b98a9e" />
        </linearGradient>
        <linearGradient id="ms-lit" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b6a2" />
          <stop offset=".35" stopColor="#b98aa6" />
          <stop offset="1" stopColor="#5b4d80" />
        </linearGradient>
        <linearGradient id="ms-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a3f72" />
          <stop offset="1" stopColor="#2a2550" />
        </linearGradient>
        <linearGradient id="ms-snow" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6e6" />
          <stop offset=".45" stopColor="#ffd8c4" />
          <stop offset="1" stopColor="#c8b8e0" />
        </linearGradient>
        <linearGradient id="ms-snow-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8b0dc" />
          <stop offset="1" stopColor="#8b84bd" />
        </linearGradient>
        <linearGradient id="ms-valley" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe2b8" stopOpacity="0" />
          <stop offset=".45" stopColor="#ffe2b8" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffe2b8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ms-hills" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4d5f78" />
          <stop offset="1" stopColor="#2c3b4c" />
        </linearGradient>
        <linearGradient id="ms-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#57784a" />
          <stop offset=".35" stopColor="#36573a" />
          <stop offset="1" stopColor="#13261a" />
        </linearGradient>
        <linearGradient id="ms-rim" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffbf73" stopOpacity=".55" />
          <stop offset=".35" stopColor="#ffbf73" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ms-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0c8" stopOpacity=".38" />
          <stop offset="1" stopColor="#fff0c8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ms-crown" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffbe0" stopOpacity="1" />
          <stop offset=".4" stopColor="#ffe08a" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffd28a" stopOpacity="0" />
        </radialGradient>
        <filter id="ms-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="ms-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* sky */}
      <rect width="1600" height="800" fill="url(#ms-sky)" />
      <g className="summit-stars">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity=".85" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </g>

      {/* the setting sun behind the peak, and its rays */}
      <circle cx={CX + 262} cy="300" r="420" fill="url(#ms-sun)" />
      <g filter="url(#ms-blur)">
        <Rays x={CX + 262} y={300} id="ms-ray" len={1000} count={17} opacity={0.3} />
      </g>

      {/* sunset cloud streaks */}
      <g opacity=".85" filter="url(#ms-soft)">
        {[[120, 300, 260, 7], [420, 330, 220, 6], [1080, 290, 300, 8], [1330, 340, 240, 6], [700, 360, 180, 5], [960, 250, 160, 5], [250, 250, 170, 4]].map(([x, y, w, h], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={w} ry={h} fill="#ffb98a" opacity=".55" />
            <ellipse cx={x + 20} cy={y - 3} rx={w * 0.6} ry={h * 0.5} fill="#ffe3bc" opacity=".6" />
          </g>
        ))}
      </g>
      <Birds x={CX - 120} y={210} s={1.1} color="#3a2346" />
      <Birds x={CX + 520} y={170} s={0.8} color="#3a2346" cls="adv-birds adv-birds-b" />

      {/* the farthest ranges, softened by haze */}
      <path d={range([350, 300, 330, 270, 310, 340, 290, 320, 300, 350, 280, 330, 300, 345, 310, 330], 480, 110)} fill="url(#ms-r1)" opacity=".75" />
      <rect y="320" width="1600" height="180" fill="url(#ms-haze)" />

      {/* the great peak */}
      <g transform={`translate(${CX} 0)`}>
        {/* flanking peaks */}
        <path d="M-160 520L-40 300L10 340L60 270L130 360L200 520Z" fill="url(#ms-r2)" />
        <path d="M-40 300L-60 330L-30 322L-12 338L10 340Z" fill="#f6d8d0" opacity=".8" />
        <path d="M280 520L360 320L400 350L450 255L540 420L600 520Z" fill="url(#ms-r2)" />
        <path d="M450 255L432 290L452 284L466 300L478 290Z" fill="#fde6d6" opacity=".85" />
        <rect x="-200" y="380" width="900" height="160" fill="url(#ms-haze)" />

        {/* main massif: shadow face, then the lit (sunward) face */}
        <path d="M205 118L180 156L160 186L140 222L118 262L96 300L70 340L40 386L0 440L-60 500L-140 560L560 560L480 500L420 440L376 382L336 324L302 270L274 222L252 184L232 152Z" fill="url(#ms-shade)" />
        <path d="M205 118L232 152L252 184L274 222L302 270L336 324L376 382L420 440L480 500L560 560L240 560L226 500L238 440L220 380L236 320L218 262L226 200L212 160Z" fill="url(#ms-lit)" />
        {/* rock strata and gullies */}
        <g stroke="#2a2550" strokeWidth="1.3" fill="none" opacity=".3" strokeLinecap="round">
          <path d="M150 230l22 10 12-8M118 290l26 8 20-10M86 340l30 10 24-12M60 392l34 8 30-14M30 440l40 6 36-14" />
          <path d="M170 200q8 40-6 80t4 90M120 300q10 40-2 90" />
        </g>
        <g stroke="#ffd9c0" strokeWidth="1.2" fill="none" opacity=".28" strokeLinecap="round">
          <path d="M262 236l-14 18 18 4M300 300l-18 22 22 2M344 360l-20 20 26 4M390 420l-24 18 30 4" />
          <path d="M248 200q-8 44 8 90t-4 80" />
        </g>
        {/* snowfields: alpenglow on the sunward side */}
        <path d="M205 118L180 156L166 180L176 186L184 176L190 196L198 186L206 206L214 192L222 210L230 196L240 206L248 192L258 204L252 184L232 152Z" fill="url(#ms-snow-shade)" />
        <path d="M205 118L232 152L252 184L262 204L272 224L262 222L256 232L246 222L238 236L230 224L222 238L214 222L210 206L214 190L212 160Z" fill="url(#ms-snow)" />
        <path d="M140 222l14 6 8-10 6 12 10-6M118 262l12 4 10-8" stroke="#ece6f8" strokeWidth="2" fill="none" opacity=".55" strokeLinecap="round" />
        <path d="M302 270l-10 14 14 0 4 10 10-6M336 324l-12 12 16 2" stroke="#fff0e2" strokeWidth="2.2" fill="none" opacity=".7" strokeLinecap="round" />
        {/* the sunward ridge glows */}
        <path d="M205 118L232 152L252 184L274 222L302 270L336 324L376 382L420 440" stroke="#ffe2b0" strokeWidth="2.4" fill="none" opacity=".85" filter="url(#ms-soft)" />
        <path d="M205 118L232 152L252 184L274 222L302 270" stroke="#fffbe8" strokeWidth="1" fill="none" />
        {/* the summit's light, where the boss waits */}
        <circle className="summit-crown" cx="205" cy="118" r="34" fill="url(#ms-crown)" />
      </g>

      {/* the valley mist, lit gold */}
      <rect x="-40" y="420" width="1680" height="190" fill="url(#ms-valley)" className="summit-mist" />

      {/* foothills with distant pines */}
      <path d="M0 540Q160 492 330 516T640 506Q720 488 810 506T1060 498T1320 514T1600 500V660H0Z" fill="url(#ms-hills)" />
      <Pines trees={Array.from({ length: 40 }, (_, i) => [10 + i * 40 + wobble(i) * 20, 528 + wobble(i + 3) * 14, 22 + wobble(i + 8) * 18])} fill="#2b3a4c" rim="url(#ms-rim)" seed={3} />
      <rect x="-40" y="500" width="1680" height="90" fill="url(#ms-valley)" opacity=".55" />

      {/* the forest floor */}
      <path d="M0 620Q200 568 420 594T800 580T1180 596T1600 584V820H0Z" fill="url(#ms-meadow)" />
      {/* sunlight slanting through the trees */}
      <g className="summit-shafts" style={{ mixBlendMode: "screen" }} opacity=".45" filter="url(#ms-blur)">
        {[[CX + 300, 70], [CX + 360, 40], [CX + 80, 50], [1250, 80], [300, 60]].map(([x, w], i) => (
          <path key={i} d={`M${x} 520L${x + w} 520L${x - 160 + w} 820L${x - 160} 820Z`} fill="url(#ms-shaft)" />
        ))}
      </g>
      {/* forest: middle distance, then near, then the darkest frame */}
      <Pines
        trees={[[CX + 8, 626, 64], [CX + 36, 640, 80], [CX + 372, 628, 70], [CX + 396, 646, 86], [CX + 64, 654, 56], [CX + 346, 660, 60], [120, 616, 76], [240, 630, 64], [360, 620, 70], [470, 636, 62], [1130, 628, 66], [1250, 614, 78], [1380, 634, 64], [1500, 620, 76]]}
        fill="#24452f"
        rim="url(#ms-rim)"
        seed={11}
      />
      <Pines
        trees={[[CX - 6, 740, 160], [CX + 30, 780, 200], [CX + 392, 750, 170], [CX + 420, 800, 230], [CX + 76, 820, 130], [CX + 330, 830, 150], [60, 780, 230], [180, 820, 270], [330, 800, 210], [470, 780, 190], [1110, 790, 200], [1260, 810, 250], [1400, 780, 220], [1530, 820, 270]]}
        fill="#11281b"
        rim="url(#ms-rim)"
        seed={23}
      />
      <Pines trees={[[CX - 14, 880, 320], [CX + 424, 890, 340], [20, 900, 400], [1590, 900, 400]]} fill="#081710" seed={41} />
      {/* fireflies */}
      {[[CX + 120, 700], [CX + 270, 660], [CX + 90, 620], [CX + 320, 740], [CX + 200, 650], [CX + 150, 770], [300, 690], [1300, 680], [450, 650], [1150, 720], [CX + 40, 690], [CX + 360, 690]].map(([x, y], i) => (
        <circle key={i} className="summit-firefly" cx={x} cy={y} r="1.8" fill="#fff3a0" style={{ animationDelay: `${i * 0.55}s` }} />
      ))}
    </svg>
  );
}

/**
 * Drifting clouds over the climb — drawn above the dotted way up, so the
 * route to the summit is glimpsed but never quite seen. Lit warm from the
 * sunset side.
 */
export function MountainClouds() {
  const cloud = (x: number, y: number, s: number, o: number, cls: string, delay: number) => (
    <g key={`${x}-${y}`} className={cls} style={{ animationDelay: `${delay}s` }} opacity={o}>
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="2" cy="7" rx="54" ry="9" fill="#b98aa6" opacity=".45" filter="url(#mc-soft)" />
        <ellipse cx="0" cy="0" rx="48" ry="14" fill="url(#mc-body)" />
        <ellipse cx="-24" cy="-8" rx="22" ry="14" fill="url(#mc-body)" />
        <ellipse cx="9" cy="-14" rx="27" ry="18" fill="url(#mc-body)" />
        <ellipse cx="34" cy="-5" rx="18" ry="11" fill="url(#mc-body)" />
        <ellipse cx="18" cy="-20" rx="14" ry="6" fill="#fff8ec" opacity=".8" />
      </g>
    </g>
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio={SCENE_ASPECT} aria-hidden>
      <defs>
        <linearGradient id="mc-body" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4e2" />
          <stop offset=".55" stopColor="#f6dcd8" />
          <stop offset="1" stopColor="#c9a9c4" />
        </linearGradient>
        <filter id="mc-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g transform={`translate(${CX} 0)`}>
        {cloud(258, 196, 1.05, 0.9, "summit-cloud-a", 0)}
        {cloud(150, 262, 1.3, 0.94, "summit-cloud-b", 2)}
        {cloud(292, 330, 1.25, 0.88, "summit-cloud-a", 4)}
        {cloud(118, 392, 1.55, 0.9, "summit-cloud-b", 1)}
        {cloud(300, 446, 1.5, 0.82, "summit-cloud-a", 3)}
        {cloud(200, 500, 1.9, 0.6, "summit-cloud-b", 5)}
      </g>
      {cloud(180, 250, 1.4, 0.7, "summit-cloud-a", 2)}
      {cloud(1420, 220, 1.5, 0.7, "summit-cloud-b", 3)}
    </svg>
  );
}

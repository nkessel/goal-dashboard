import { Birds, Pines, Rays, wobble } from "./art";

/**
 * The Crossing: a river valley on a fresh spring morning. Soft blue hills,
 * meadows of wildflowers, willows by the water, and on the far hill the
 * castle that is the boss, its banners lifting in the breeze. Today's
 * quests are stepping stones across the river.
 */
const CX = 600;
export const CROSSING_GOAL = { x: CX + 205, y: 196 };

export function CrossingScene() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="cr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e9fd0" />
          <stop offset=".25" stopColor="#a9c8e6" />
          <stop offset=".42" stopColor="#f2dcc8" />
          <stop offset=".5" stopColor="#ffe9c8" />
        </linearGradient>
        <radialGradient id="cr-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffbea" stopOpacity="1" />
          <stop offset=".25" stopColor="#fff0c4" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffe0a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cr-h1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fb4cf" />
          <stop offset="1" stopColor="#c7d3de" />
        </linearGradient>
        <linearGradient id="cr-h2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d9fa8" />
          <stop offset="1" stopColor="#a4bfb4" />
        </linearGradient>
        <linearGradient id="cr-h3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6f9a6a" />
          <stop offset="1" stopColor="#527d52" />
        </linearGradient>
        <linearGradient id="cr-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86ad62" />
          <stop offset=".5" stopColor="#5f8a46" />
          <stop offset="1" stopColor="#3b5f2e" />
        </linearGradient>
        <linearGradient id="cr-river" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9f2f6" />
          <stop offset=".3" stopColor="#a9cbe0" />
          <stop offset="1" stopColor="#4f86ad" />
        </linearGradient>
        <linearGradient id="cr-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset=".5" stopColor="#ffffff" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cr-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9e2d2" />
          <stop offset="1" stopColor="#b5a991" />
        </linearGradient>
        <linearGradient id="cr-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff2c8" stopOpacity=".5" />
          <stop offset=".35" stopColor="#fff2c8" stopOpacity="0" />
        </linearGradient>
        <filter id="cr-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <rect width="1600" height="800" fill="url(#cr-sky)" />
      {/* morning sun, low on the left */}
      <circle cx={CX - 60} cy="330" r="260" fill="url(#cr-sun)" />
      <Rays x={CX - 60} y={330} id="cr-ray" len={900} count={13} color="#fffbe8" opacity={0.22} spread={[-178, -2]} />
      {/* high soft clouds */}
      <g fill="#ffffff" opacity=".7" filter="url(#cr-soft)">
        {[[200, 140, 120, 14], [480, 90, 90, 10], [1100, 120, 140, 16], [1380, 80, 100, 11], [800, 60, 80, 9]].map(([x, y, w, h], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={w} ry={h} />
            <ellipse cx={x + w * 0.2} cy={y - h * 0.7} rx={w * 0.5} ry={h * 0.9} />
          </g>
        ))}
      </g>
      <Birds x={CX + 380} y={150} s={1} color="#3d4a5a" />

      {/* far hills */}
      <path d="M0 360Q200 300 420 330T820 300T1220 320T1600 300V420H0Z" fill="url(#cr-h1)" />

      {/* the castle on the far hill */}
      <path d={`M${CX + 40} 380Q${CX + 140} 250 ${CX + 205} 252Q${CX + 290} 250 ${CX + 380} 380Z`} fill="url(#cr-h2)" />
      <g transform={`translate(${CX + 205} 0)`}>
        <rect x="-38" y="226" width="76" height="34" fill="#e8dfd0" />
        <rect x="-38" y="226" width="76" height="34" fill="url(#cr-rim)" />
        <path d="M-38 226v-4h6v4h6v-4h6v4h6v-4h6v4h6v-4h6v4h6v-4h6v4h6v-4h6v4h6v-4h4v4" fill="none" stroke="#e8dfd0" strokeWidth="4" />
        {/* towers */}
        <rect x="-50" y="204" width="16" height="56" fill="#ddd2c0" />
        <path d="M-54 206L-42 182L-30 206Z" fill="#5a6fa8" />
        <rect x="34" y="208" width="16" height="52" fill="#ddd2c0" />
        <path d="M30 210L42 186L54 210Z" fill="#5a6fa8" />
        <rect x="-11" y="186" width="22" height="42" fill="#efe7da" />
        <path d="M-16 188L0 156L16 188Z" fill="#6a7fbc" />
        {/* banners */}
        <path d="M0 156v-14" stroke="#4a3b2a" strokeWidth="1.2" />
        <path className="crossing-flag" d="M0 142l14 3-14 4z" fill="#c8434f" />
        <path d="M-42 182v-10M42 186v-10" stroke="#4a3b2a" strokeWidth="1" />
        <path className="crossing-flag" d="M-42 172l9 2-9 3z" fill="#e2b03a" />
        <path className="crossing-flag" d="M42 176l9 2-9 3z" fill="#e2b03a" />
        {/* warm windows and the gate */}
        <g fill="#ffd27a">
          <rect x="-3" y="196" width="6" height="9" rx="3" />
          <rect x="-45" y="218" width="5" height="8" rx="2.5" />
          <rect x="39" y="222" width="5" height="8" rx="2.5" />
          <rect x="-22" y="236" width="5" height="7" rx="2.5" />
          <rect x="17" y="236" width="5" height="7" rx="2.5" />
        </g>
        <path d="M-8 260v-12a8 8 0 0 1 16 0v12z" fill="#4a3b2a" />
        <circle cx="0" cy="190" r="40" fill="url(#cr-sun)" className="summit-crown" opacity=".7" />
      </g>

      {/* nearer hills and woods */}
      <path d="M0 420Q180 370 380 400T760 392Q840 380 920 396T1300 384T1600 404V520H0Z" fill="url(#cr-h3)" opacity=".9" />
      <Pines trees={Array.from({ length: 44 }, (_, i) => [5 + i * 37 + wobble(i) * 14, 412 + wobble(i + 3) * 18, 26 + wobble(i + 8) * 22])} fill="#4c7348" rim="url(#cr-rim)" seed={5} />
      <rect x="0" y="380" width="1600" height="140" fill="url(#cr-mist)" className="summit-mist" />

      {/* the meadow and the river winding up toward the castle */}
      <path d="M0 470Q300 440 620 458T1200 452T1600 466V800H0Z" fill="url(#cr-meadow)" />
      <path
        d={`M${CX + 150} 452Q${CX + 120} 470 ${CX + 170} 492Q${CX + 260} 520 ${CX + 180} 560Q${CX + 60} 610 ${CX + 140} 660Q${CX + 240} 720 ${CX + 160} 800L${CX + 360} 800Q${CX + 420} 720 ${CX + 300} 660Q${CX + 220} 610 ${CX + 300} 560Q${CX + 360} 518 ${CX + 250} 490Q${CX + 200} 470 ${CX + 240} 452Z`}
        fill="url(#cr-river)"
      />
      <g stroke="#ffffff" strokeLinecap="round" fill="none" className="voyage-glitter">
        {Array.from({ length: 28 }, (_, i) => {
          const t = i / 28;
          const y = 470 + t * 320;
          const x = CX + 205 + Math.sin(t * 6 + 1) * (40 + t * 30) + (wobble(i) - 0.5) * 40 * (0.5 + t);
          return <path key={i} d={`M${x} ${y}h${8 + t * 26}`} strokeWidth={0.8 + t * 1.4} opacity={0.35 + 0.3 * wobble(i + 2)} style={{ animationDelay: `${wobble(i) * 3}s` }} />;
        })}
      </g>
      {/* reeds and wildflowers */}
      <g>
        {Array.from({ length: 90 }, (_, i) => {
          const x = wobble(i + 1) * 1600;
          const y = 520 + Math.pow(wobble(i + 30), 0.7) * 270;
          const c = ["#f6e7a0", "#f2a6b8", "#ffffff", "#b9a6f0", "#ffcf6a"][i % 5];
          return <circle key={i} cx={x} cy={y} r={1.2 + (y - 520) / 120} fill={c} opacity=".85" />;
        })}
      </g>
      {/* willows framing the near banks */}
      {[[CX - 60, 800, 1], [CX + 470, 790, -1], [120, 760, 1], [1460, 770, -1]].map(([x, b, dir], i) => (
        <g key={i} transform={`translate(${x} ${b}) scale(${dir} 1)`}>
          <path d="M0 0C-4 -60 4 -120 -10 -180" stroke="#4b3a26" strokeWidth="9" fill="none" strokeLinecap="round" />
          <ellipse cx="-12" cy="-190" rx="70" ry="46" fill="#5f8a46" />
          <ellipse cx="18" cy="-170" rx="56" ry="38" fill="#6f9a52" />
          <g stroke="#7fa85c" strokeWidth="2" fill="none" opacity=".9" className="crossing-willow">
            {Array.from({ length: 14 }, (_, k) => (
              <path key={k} d={`M${-70 + k * 10} ${-170 + (k % 3) * 6}q${-2 + (k % 2) * 4} 40 ${-4 + (k % 3) * 3} ${70 + (k % 4) * 14}`} />
            ))}
          </g>
        </g>
      ))}
      <g stroke="#4f7a3a" strokeWidth="2.2" strokeLinecap="round" fill="none">
        {Array.from({ length: 40 }, (_, i) => {
          const x = i < 20 ? CX + 120 + wobble(i) * 40 : CX + 300 + wobble(i) * 60;
          return <path key={i} d={`M${x} 800q${(wobble(i + 3) - 0.5) * 10} -30 ${(wobble(i + 5) - 0.5) * 14} ${-40 - wobble(i + 7) * 40}`} />;
        })}
      </g>
    </svg>
  );
}

/** Morning mist lying on the water, hiding the far reach of the river. */
export function CrossingVeil() {
  const bank = (x: number, y: number, w: number, h: number, o: number, cls: string, d: number) => (
    <ellipse key={`${x}${y}`} className={cls} style={{ animationDelay: `${d}s` }} cx={x} cy={y} rx={w} ry={h} fill="url(#cv-mist)" opacity={o} filter="url(#cv-blur)" />
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <radialGradient id="cv-mist" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id="cv-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      {bank(CX + 170, 300, 180, 20, 0.7, "summit-cloud-a", 0)}
      {bank(CX + 260, 340, 220, 24, 0.7, "summit-cloud-b", 2)}
      {bank(CX + 120, 380, 240, 26, 0.75, "summit-cloud-a", 4)}
      {bank(CX + 280, 420, 260, 24, 0.6, "summit-cloud-b", 1)}
      {bank(CX + 180, 456, 300, 22, 0.5, "summit-cloud-a", 3)}
    </svg>
  );
}

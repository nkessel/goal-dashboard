/** Shared brushwork for the adventure views: pines, birds, rays and haze. */

/** A deterministic wobble, so a scene looks hand-made but never changes. */
export function wobble(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A pine silhouette with layered, jagged branches. */
export function pinePath(x: number, base: number, h: number, seed = 1) {
  const tiers = 7;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers;
    const y = base - h + h * 0.9 * t;
    const wl = h * 0.34 * Math.pow(t, 0.85) * (0.88 + wobble(seed + i) * 0.24);
    const wr = h * 0.34 * Math.pow(t, 0.85) * (0.88 + wobble(seed * 3 + i) * 0.24);
    const notch = h * 0.055;
    L.push([x - wl, y]);
    if (i < tiers) L.push([x - wl * 0.4, y - notch * 0.2]);
    R.push([x + wr, y]);
    if (i < tiers) R.push([x + wr * 0.4, y - notch * 0.2]);
  }
  const tw = Math.max(1.5, h * 0.035);
  const ty = base - h * 0.1 + h * 0.0;
  const pts: [number, number][] = [[x, base - h], ...L, [x - tw, ty], [x - tw, base], [x + tw, base], [x + tw, ty], ...R.reverse()];
  return "M" + pts.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join("L") + "Z";
}

/** A row of pines: [x, base, height] each, in one fill, with optional rim light. */
export function Pines({ trees, fill, rim, seed = 1 }: { trees: number[][]; fill: string; rim?: string; seed?: number }) {
  return (
    <g>
      {trees.map(([x, b, h], i) => {
        const d = pinePath(x, b, h, seed + i * 7);
        return (
          <g key={i}>
            <path d={d} fill={fill} />
            {rim && <path d={d} fill={rim} />}
          </g>
        );
      })}
    </g>
  );
}

/** A little flock crossing the sky. */
export function Birds({ x, y, s = 1, color = "#2a2340", cls = "adv-birds" }: { x: number; y: number; s?: number; color?: string; cls?: string }) {
  const b = (dx: number, dy: number, k: number) => <path key={`${dx}${dy}`} className="adv-bird" d={`M${dx} ${dy}q${3 * k} ${-3 * k} ${6 * k} 0q${3 * k} ${-3 * k} ${6 * k} 0`} stroke={color} strokeWidth={1.3} fill="none" strokeLinecap="round" />;
  return (
    <g className={cls} transform={`translate(${x} ${y}) scale(${s})`}>
      {b(0, 0, 1)}
      {b(14, 6, 0.85)}
      {b(-12, 8, 0.8)}
      {b(26, 13, 0.7)}
      {b(-22, 16, 0.65)}
    </g>
  );
}

/** Long soft rays fanning up from a light source. */
export function Rays({ x, y, id, color = "#fff1d0", count = 13, len = 900, spread = [-172, -8], opacity = 0.32 }: { x: number; y: number; id: string; color?: string; count?: number; len?: number; spread?: [number, number]; opacity?: number }) {
  return (
    <g className="adv-rays" style={{ mixBlendMode: "screen" }} opacity={opacity}>
      <defs>
        <radialGradient id={id} cx={x} cy={y} r={len} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={color} stopOpacity=".9" />
          <stop offset=".6" stopColor={color} stopOpacity=".15" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: count }, (_, i) => {
        const a = ((spread[0] + ((spread[1] - spread[0]) * (i + 0.5)) / count + (wobble(i + 4) - 0.5) * 6) * Math.PI) / 180;
        const w = (0.018 + wobble(i) * 0.03) * (wobble(i + 9) > 0.5 ? 1 : 0.55);
        const a1 = a - w;
        const a2 = a + w;
        return <path key={i} d={`M${x} ${y}L${x + Math.cos(a1) * len} ${y + Math.sin(a1) * len}L${x + Math.cos(a2) * len} ${y + Math.sin(a2) * len}Z`} fill={`url(#${id})`} />;
      })}
    </g>
  );
}

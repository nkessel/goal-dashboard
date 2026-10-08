/**
 * A quest board's mark: a small wax seal in the board's own colour (deep
 * red when it has none), pressed with a four-point star. Quiet enough to sit
 * beside a title rather than headline the card.
 */
const DEFAULT_WAX = "#8e2b25";

/** The board colour swatches are pastels (for Calm cards); wax needs the deep version. */
const WAX_FOR: Record<string, string> = {
  "#fde8d0": "#b0632a",
  "#dcefe0": "#3d7448",
  "#e0e7fb": "#3a5795",
  "#fbe0e6": "#a33a59",
  "#fff4c2": "#b08a22",
};

export function BoardSeal({ color, size = 22 }: { color?: string | null; size?: number }) {
  const wax = (color && (WAX_FOR[color.toLowerCase()] ?? color)) || DEFAULT_WAX;
  // Irregular rim: a few uneven puddles of wax around the pressed disc.
  const drips = [
    { a: 0.2, d: 7.4, r: 3.4 },
    { a: 1.25, d: 7.8, r: 2.9 },
    { a: 2.3, d: 7.2, r: 3.6 },
    { a: 3.35, d: 7.9, r: 2.7 },
    { a: 4.3, d: 7.3, r: 3.5 },
    { a: 5.35, d: 7.7, r: 3.0 },
  ].map(({ a, d, r }) => ({ cx: 12 + Math.cos(a) * d, cy: 12 + Math.sin(a) * d, r }));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <radialGradient id="seal-shade" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".42" />
        </radialGradient>
      </defs>
      <g fill={wax}>
        {drips.map((d, i) => (
          <circle key={i} cx={d.cx.toFixed(2)} cy={d.cy.toFixed(2)} r={d.r} />
        ))}
        <circle cx="12" cy="12" r="8.8" />
      </g>
      <circle cx="12" cy="12" r="10.4" fill="url(#seal-shade)" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth=".9" />
      <path d="M12 7.6l1.05 3.35L16.4 12l-3.35 1.05L12 16.4l-1.05-3.35L7.6 12l3.35-1.05z" fill="#000" fillOpacity=".32" />
    </svg>
  );
}

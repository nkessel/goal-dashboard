/**
 * The castles that can stand on the far hill behind the welcome screen, each
 * an original fairytale design, chosen in Settings › Welcome Screen. Each is
 * drawn about its base centre (0, 0), rising into negative y.
 */
export type CastleDesign = "spires" | "highland" | "domes" | "tower" | "none";

export const CASTLE_DESIGNS: { key: CastleDesign; label: string; hint: string }[] = [
  { key: "spires", label: "Spire castle", hint: "White towers with tall blue spires and gold pennants" },
  { key: "highland", label: "Highland keep", hint: "A sturdy stone keep with battlements and one round tower" },
  { key: "domes", label: "Palace of domes", hint: "Onion domes and slender towers with golden finials" },
  { key: "tower", label: "Wizard's tower", hint: "One tall tower with a balcony, alone on the hill" },
  { key: "none", label: "No castle", hint: "Just the hills and the mist" },
];

/** Every castle is a spire castle now (one generated from a seed); older choices fall back to it. */
export const castleOf = (v?: unknown): CastleDesign => (v === "spires" || !v ? "spires" : "spires");

type Shape = { walls: string; roofs: string; flags: string; windows: [number, number][]; gate: boolean };

const rect = (x: number, w: number, h: number) => `M${x - w / 2},0 V${-h} H${x + w / 2} V0 Z `;
/** A wall with battlements along its top. */
function battlements(x0: number, x1: number, h: number, step = 6) {
  let d = `M${x0},0 V${-h}`;
  for (let x = x0; x < x1 - 0.1; x += step) d += ` h${step / 3} v-3 h${step / 3} v3 h${step / 3}`;
  return d + ` V0 Z `;
}
/** A flared cone: concave sides sweeping up to a needle point, with an eave ring. */
function cone(x: number, w: number, h: number, sh: number) {
  const half = w / 2 + 2.5;
  return `M${x - half},${-h} C${x - half * 0.45},${-h - sh * 0.35} ${x - 1.2},${-h - sh * 0.75} ${x},${-h - sh} C${x + 1.2},${-h - sh * 0.75} ${x + half * 0.45},${-h - sh * 0.35} ${x + half},${-h} Z M${x - half},${-h} h${half * 2} v2 h${-half * 2} Z `;
}
/** An onion dome swelling out and drawing to a point, with a finial. */
function dome(x: number, w: number, h: number, bulb: number) {
  const r = w / 2;
  return `M${x - r},${-h} C${x - r * 1.5},${-h - bulb * 0.45} ${x - r * 0.4},${-h - bulb * 0.8} ${x},${-h - bulb} C${x + r * 0.4},${-h - bulb * 0.8} ${x + r * 1.5},${-h - bulb * 0.45} ${x + r},${-h} Z M${x - r - 1},${-h} h${w + 2} v2 h${-w - 2} Z `;
}
const pennant = (x: number, top: number, len = 8) => `M${x},${top} v-9 l${len},2.5 l${-len},2.5 `;
const finial = (x: number, top: number) => `M${x - 0.6},${top} v-7 h1.2 v7 Z M${x},${top - 8.5} m-1.6,0 a1.6,1.6 0 1 0 3.2,0 a1.6,1.6 0 1 0 -3.2,0 `;

function spires(): Shape {
  const towers: [number, number, number, number][] = [
    [-58, 14, 40, 26],
    [58, 14, 40, 26],
    [-31, 15, 58, 34],
    [31, 15, 58, 34],
    [-13, 9, 74, 24],
    [13, 9, 74, 24],
    [0, 17, 90, 50],
  ];
  let walls = battlements(-58, 58, 22) + battlements(-24, 24, 54);
  let roofs = "";
  let flags = "";
  for (const [x, w, h, sh] of towers) {
    walls += rect(x, w, h);
    roofs += cone(x, w, h, sh);
    flags += pennant(x, -h - sh, 7 + w * 0.15);
  }
  return { walls, roofs, flags, gate: true, windows: [[-58, 30], [58, 30], [-31, 46], [-31, 32], [31, 46], [31, 32], [-13, 64], [13, 64], [0, 78], [0, 62], [-8, 40], [8, 40]] };
}

function highland(): Shape {
  const walls = battlements(-62, 62, 20) + battlements(-70, -50, 44, 5) + battlements(50, 70, 44, 5) + battlements(-24, 22, 64, 5.75) + battlements(-34, -22, 52, 4) + rect(32, 13, 76);
  const roofs = cone(32, 13, 76, 20);
  const flags = pennant(32, -96, 9) + pennant(-1, -67, 9);
  return { walls, roofs, flags, gate: true, windows: [[-60, 34], [60, 34], [-12, 50], [0, 50], [12, 50], [-6, 34], [6, 34], [32, 62], [32, 46], [-28, 40]] };
}

function domes(): Shape {
  let walls = battlements(-56, 56, 18, 8) + rect(0, 46, 46);
  let roofs = dome(0, 40, 46, 38);
  let flags = finial(0, -84);
  for (const [x, w, h, b] of [
    [-50, 11, 50, 16],
    [50, 11, 50, 16],
    [-31, 6, 68, 11],
    [31, 6, 68, 11],
  ] as const) {
    walls += rect(x, w, h);
    roofs += dome(x, w, h, b);
    flags += finial(x, -h - b);
  }
  return { walls, roofs, flags, gate: true, windows: [[-50, 36], [50, 36], [-31, 56], [31, 56], [-12, 30], [0, 32], [12, 30], [-8, 18], [8, 18]] };
}

function tower(): Shape {
  // Its footing reaches down into the hill so it never floats.
  const walls = "M-18,14 V0 H18 V14 Z " + battlements(-18, 18, 12, 6) + "M-7.5,14 V-112 H7.5 V14 Z " + `M-12,-84 h24 v3.5 h-24 Z ` + rect(10, 7, 74);
  const roofs = cone(0, 15, 112, 40) + cone(10, 7, 74, 15);
  const flags = pennant(0, -152, 10);
  return { walls, roofs, flags, gate: false, windows: [[0, 100], [0, 72], [0, 52], [0, 30], [10, 62]] };
}

const SHAPES: Record<Exclude<CastleDesign, "none">, Shape> = { spires: spires(), highland: highland(), domes: domes(), tower: tower() };

/** A small seeded random, so the same seed always draws the same castle. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A spire castle grown from a seed: a tall central keep, two to four pairs of
 * towers stepping down to either side (a little uneven, as real castles are),
 * flared blue spires with pennants, and its footing sunk into the hill.
 */
export function generatedSpires(seed: number): Shape {
  const r = rng(seed);
  const between = (a: number, b: number) => a + r() * (b - a);
  const centreH = between(84, 104);
  const centreW = between(15, 20);
  const towers: [number, number, number, number][] = [[0, centreW, centreH, between(42, 58)]];
  const pairs = 2 + Math.floor(r() * 3);
  let x = centreW / 2 + between(5, 9);
  let h = centreH;
  for (let i = 0; i < pairs; i++) {
    const w = between(8, 15) - i * 0.6;
    h = h * between(0.68, 0.86);
    const sh = between(18, 34) * (h / 70);
    x += w / 2;
    // Mirror each pair, with a touch of difference between the sides.
    towers.push([-x - between(0, 2), w, h * between(0.94, 1.04), sh]);
    towers.push([x + between(0, 2), w, h * between(0.94, 1.04), sh]);
    x += w / 2 + between(5, 11);
  }
  const span = x - 4;
  // Footings run below the base line so it stands in the hill, never above it.
  let walls = `M${-span},10 V0 H${span} V10 Z ` + battlements(-span, span, between(18, 24)) + battlements(-x * 0.45, x * 0.45, between(42, 56));
  let roofs = "";
  let flags = "";
  const windows: [number, number][] = [];
  for (const [tx, w, th, sh] of towers) {
    walls += `M${tx - w / 2},10 V${-th} H${tx + w / 2} V10 Z `;
    roofs += cone(tx, w, th, sh);
    flags += pennant(tx, -th - sh, 6 + w * 0.18);
    for (let wy = th - 14; wy > 22; wy -= between(14, 20)) windows.push([tx, wy]);
  }
  return { walls, roofs, flags, gate: true, windows };
}

export type CastleColors = { wall: string; shade: string; roof: string; gold: string; light?: string };

/** One castle, as SVG shapes (place it with a transform on a parent group). `wallFill` can be a gradient url. */
export function CastleArt({ design, colors, wallFill, seed }: { design: CastleDesign; colors: CastleColors; wallFill?: string; seed?: number }) {
  if (design === "none") return null;
  const s = seed ? generatedSpires(seed) : SHAPES[design];
  return (
    <g>
      <path d={s.flags} fill={colors.gold} stroke={colors.gold} strokeWidth=".6" strokeLinejoin="round" />
      <path d={s.walls} fill={wallFill ?? colors.wall} />
      <path d={s.roofs} fill={colors.roof} />
      {s.gate && <path d="M-6,0 V-9 A6,6 0 0 1 6,-9 V0 Z" fill={colors.roof} opacity=".85" />}
      {s.windows.map(([x, h], k) => (
        <path key={k} d={`M${x - 1.3},${-h} v-3.2 a1.3,1.3 0 0 1 2.6,0 v3.2 Z`} fill={colors.light ?? colors.shade} opacity={colors.light ? 0.95 : 0.8} />
      ))}
    </g>
  );
}

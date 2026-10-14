// Settings + particle "genes" for the quest-complete celebration.
// Settings live in localStorage (per browser) and are edited in Settings.

export type FxSettings = {
  dens: number;
  vel: number;
  reach: number;
  size: number;
  embers: number;
  fill: number;
  fxAvatar: boolean;
  fxCard: boolean;
};

export const FX_DEFAULTS: FxSettings = {
  dens: 1.7,
  vel: 0.5,
  reach: 0,
  size: 1.1,
  embers: 105,
  fill: 3,
  fxAvatar: false,
  fxCard: true,
};

export const FX_STORAGE_KEY = "goalFxSaved";

export function loadFx(): FxSettings {
  let fx: FxSettings = { ...FX_DEFAULTS };
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    if (raw) fx = { ...FX_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  // Phones: fewer, glowier specks so the animation stays smooth.
  if (typeof window !== "undefined" && window.innerWidth < 600) {
    fx = { ...fx, dens: fx.dens * 0.6, embers: Math.round(fx.embers * 0.5) };
  }
  return fx;
}

export function saveFx(fx: FxSettings): boolean {
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify({ ...fx, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export type Speck = {
  a: number; // rotation (deg)
  r: number; // radius offset
  h: number; // half size
  s: number; // size
  d: number; // delay (s)
  t: number; // duration (s)
  c: string; // color
  g: number; // glow blur
  k: number; // glow spread
  x?: number;
  y?: number;
  tier: number; // 0-4 distance band
};

type Gene = { a: number; r: number; s0: number; d0: number; t0: number; u: number; v: number; c: string };

const frac = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const COLS = ["#ffe9a8", "#ffd76a", "#f2c96a", "#fff4cf", "#ffc94d", "#ffffff"];

function pool(n: number, seed: number, rMin: number, rMax: number): Gene[] {
  const out: Gene[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + seed;
    out.push({
      a: +(frac(j * 3.1) * 360).toFixed(1),
      r: +(rMin + frac(j * 5.3) * (rMax - rMin)).toFixed(1),
      s0: 1.4 + frac(j * 1.7) * 2.8,
      d0: frac(j * 2.3) * 2.2,
      t0: 1.3 + frac(j * 4.1) * 1.7,
      u: frac(j * 6.7),
      v: frac(j * 8.3),
      c: COLS[Math.floor(frac(j + 7) * COLS.length)],
    });
  }
  return out;
}

export const POOLS = {
  icon: pool(480, 0, 44, 50),
  char: pool(400, 500, 30, 35),
  puff: pool(240, 900, 44, 50),
  bar: pool(480, 1300, 0, 5),
  amb: pool(160, 1700, 0, 0),
  card: pool(480, 2100, 0, 0),
};

const tierOf = (fx: FxSettings, u: number) =>
  Math.min(4, Math.round(fx.reach * 4 * (0.4 + 0.6 * u)));

function speck(fx: FxSettings, it: Gene): Speck {
  const s = +(it.s0 * fx.size).toFixed(1);
  return {
    a: it.a,
    r: it.r,
    h: s / 2,
    s,
    d: +(it.d0 / fx.vel).toFixed(2),
    t: +(it.t0 / fx.vel).toFixed(2),
    c: it.c,
    g: s > 3 ? 6 : 3,
    k: s > 3 ? 1 : 0.5,
    tier: tierOf(fx, it.u),
  };
}

/** Dust hugging a circular avatar border, flying outward. */
export function ringDust(fx: FxSettings, which: "icon" | "char"): Speck[] {
  const n = Math.round(fx.dens * (which === "icon" ? 240 : 190));
  return POOLS[which].slice(0, n).map((it) => speck(fx, it));
}

/** Dust sprayed outward from the rectangular quest card border (x/y in %). */
export function cardDust(fx: FxSettings): Speck[] {
  const W = 358, H = 136, per = 2 * (W + H);
  return POOLS.card.slice(0, Math.round(fx.dens * 190)).map((it) => {
    const d = (it.a / 360) * per;
    let x: number, y: number, base: number;
    if (d < W) { x = (d / W) * 100; y = 0; base = 0; }
    else if (d < W + H) { x = 100; y = ((d - W) / H) * 100; base = 90; }
    else if (d < 2 * W + H) { x = 100 - ((d - W - H) / W) * 100; y = 100; base = 180; }
    else { x = 0; y = 100 - ((d - 2 * W - H) / H) * 100; base = 270; }
    const sp = speck(fx, it);
    return { ...sp, x: +x.toFixed(1), y: +y.toFixed(1), a: +(base + (it.v - 0.5) * 50).toFixed(1), r: 0 };
  });
}

/** Dust leaving the XP bar in every direction; x is a % of bar width, up to `edgePct`. */
export function barDust(fx: FxSettings, edgePct: number): Speck[] {
  const n = Math.round(fx.dens * 240);
  return POOLS.bar.slice(0, n).map((it) => {
    const sp = speck(fx, it);
    return {
      ...sp,
      x: +Math.max(0, edgePct * (1 - it.v * it.v * it.v)).toFixed(2),
      y: +(8 + (it.u - 0.5) * 9).toFixed(1),
    };
  });
}

/** Burst from the quest icon border as the check lands. */
export function puffDust(fx: FxSettings): Speck[] {
  if (!fx.fxAvatar) return [];
  return POOLS.puff.slice(0, Math.round(fx.dens * 120)).map((it) => ({
    ...speck(fx, it),
    d: +(0.85 + it.d0 * 0.05).toFixed(2),
    t: +(((1 + it.t0 * 0.35) / fx.vel) * 1.4).toFixed(2),
  }));
}

export type Ember = { x: number; y: number; s: number; d: number; t: number; c: string };

/** Persistent ambient embers; positions are % of the viewport. */
export function embers(fx: FxSettings): Ember[] {
  return POOLS.amb.slice(0, fx.embers).map((it) => ({
    x: +(2 + it.v * 96).toFixed(1),
    y: +(30 + it.u * 68).toFixed(1),
    s: +(2 + it.s0 * 0.6).toFixed(1),
    d: +(it.d0 * 1.8).toFixed(2),
    t: +(3.4 + it.t0 * 1.2).toFixed(2),
    c: it.c,
  }));
}

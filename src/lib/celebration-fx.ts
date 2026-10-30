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
  /** Reward payouts: "classic" (the short note) or "ceremony" (rays, coins, the bar filling). */
  rewardStyle: "classic" | "ceremony";
  /** What plays when feedback is sent. */
  feedbackStyle?: FeedbackStyle;
  /** Progress celebrations: the full card, or a slim banner at the top. (The daily welcome is always a card.) */
  cardStyle?: "card" | "banner";
  /** The daily welcome card's heading: a cheer that changes daily, the classic dawn line, or your own words. */
  welcomeHeading?: WelcomeHeading;
  /** Your own heading, when welcomeHeading is "custom". */
  welcomeText?: string;
  /** What else the welcome card shows. */
  welcomeLine?: boolean;
  welcomeStreak?: boolean;
  welcomeBar?: boolean;
  /** The welcome screen's parts, in order, and the ones hidden (see lib/welcome). */
  welcomeOrder?: string[];
  welcomeHide?: string[];
  /** The castle on the welcome screen's far hill (see CASTLE_DESIGNS). */
  welcomeCastle?: string;
  /** Back after this many hours since your last check-in: a "welcome back" screen (0 = never). */
  welcomeBackHours?: number;
  /** Your own "welcome back" greetings, one per line (they take turns with the built-in ones left on). */
  welcomeBackText?: string;
  /** Whether your own welcome back greetings are used (unset: yes, if you wrote some). */
  welcomeBackOwn?: boolean;
  /** Welcome back greetings switched off (built-in or your own). */
  welcomeBackOff?: string[];
  /** Your own wise lines, one per line, mixed in with the built-in ones. */
  welcomeOwnLines?: string;
  /** Whether your own wise lines are used (unset: yes, if you wrote some). */
  welcomeOwnOn?: boolean;
  /** The look of the welcome screen's Check in button (see CHECKIN_STYLES). */
  checkinStyle?: CheckinStyle;
  /** The Check in button's icon (see CHECKIN_ICONS). */
  checkinIcon?: CheckinIconKey;
  /** In the check-in on the welcome screen: last night's sleep times, and mood and the rest. */
  welcomeSleep?: boolean;
  welcomeMetrics?: boolean;
  /** Confetti when the welcome screen opens. */
  welcomeConfetti?: boolean;
  /** Seconds the "Feedback submitted" card stays (0 = until you close it). */
  feedbackHold?: number;
  /** How quickly the effects play: 0.75 quick, 1 as designed, 1.4 leisurely. */
  pace?: number;
  /** The + button's look (see FAB_STYLES). */
  fabStyle?: FabStyle;
  /** How much Quest complete shows: "light", "balanced" (default) or "full". */
  effects?: EffectsLevel;
};

export type EffectsLevel = "light" | "balanced" | "full";
export const EFFECTS_LEVELS: { key: EffectsLevel; label: string; hint: string }[] = [
  { key: "light", label: "Light", hint: "Comes up at once: the card, the check and the XP bar, no extra sparkle" },
  { key: "balanced", label: "Balanced", hint: "Comes up fast, the sparkles follow; lighter on slower devices" },
  { key: "full", label: "Full", hint: "Everything, at the original unhurried pace" },
];

/** A slower device (few cores, little memory, data saver or reduced motion) gets the lighter scene under "Balanced". */
export function isSlowDevice(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    (nav.hardwareConcurrency ?? 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 3 ||
    Boolean(nav.connection?.saveData) ||
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

/** What Quest complete actually plays on this device. */
export function effectsTier(fx: FxSettings): EffectsLevel {
  const level = fx.effects ?? "balanced";
  return level === "balanced" && isSlowDevice() ? "light" : level;
}

export type WelcomeHeading = "cheer" | "dawn" | "custom";
export const WELCOME_HEADINGS: { key: WelcomeHeading; label: string; hint: string }[] = [
  { key: "cheer", label: "A cheer", hint: "“Huzzah! Here you are!” and others, a different one each day" },
  { key: "dawn", label: "A new day dawns", hint: "“A new day dawns, adventurer”, every day" },
  { key: "custom", label: "Your own words", hint: "Write the greeting yourself" },
];

export type CheckinStyle = "gilded" | "enamel" | "parchment" | "wax";
export const CHECKIN_STYLES: { key: CheckinStyle; label: string; hint: string; style: React.CSSProperties }[] = [
  { key: "gilded", label: "Gilded", hint: "A polished gold bar with a soft shine", style: { background: "linear-gradient(180deg, #f8e3a0 0%, #e2bf63 45%, #b8913f 100%)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,250,230,.8), inset 0 -2px 0 rgba(90,60,15,.35), 0 2px 6px rgba(74,57,19,.35)" } },
  { key: "enamel", label: "Night enamel", hint: "Dark enamel in a gilt rim, gold letters", style: { background: "linear-gradient(180deg, #2f2a20, #17140e)", border: "2px solid #c9a24a", color: "#f2d27e", boxShadow: "inset 0 0 0 1px rgba(255,230,170,.18), 0 2px 6px rgba(0,0,0,.35)" } },
  { key: "parchment", label: "Parchment", hint: "Quiet: parchment with an ink-brown rim", style: { background: "linear-gradient(180deg, #fbf3dc, #ecdcb4)", border: "1.5px solid #8b7040", color: "#3b2a14", boxShadow: "0 1px 3px rgba(80,60,20,.25)" } },
  { key: "wax", label: "Wax seal", hint: "Deep red wax with cream letters", style: { background: "radial-gradient(circle at 35% 30%, #c0503a, #8e2a1d 70%)", border: "1.5px solid #5a160d", color: "#fbefd4", boxShadow: "inset 0 1px 0 rgba(255,200,180,.35), 0 2px 6px rgba(90,22,13,.35)" } },
];
export type CheckinIconKey = "sun" | "leaf" | "flame" | "compass" | "lantern" | "heart" | "feather" | "moon" | "none";
/** The Check in button's icon (it always says "Check in"). */
export const CHECKIN_ICONS: { key: CheckinIconKey; label: string }[] = [
  { key: "sun", label: "Sun" },
  { key: "leaf", label: "Leaf" },
  { key: "flame", label: "Flame" },
  { key: "compass", label: "Compass" },
  { key: "lantern", label: "Lantern" },
  { key: "heart", label: "Heart" },
  { key: "feather", label: "Feather" },
  { key: "moon", label: "Moon" },
  { key: "none", label: "No icon" },
];
export const checkinIconOf = (fx: FxSettings): CheckinIconKey => CHECKIN_ICONS.find((c) => c.key === fx.checkinIcon)?.key ?? "sun";
export const checkinStyleOf = (fx: FxSettings) => CHECKIN_STYLES.find((c) => c.key === fx.checkinStyle) ?? CHECKIN_STYLES[0];

export type FabStyle = "seal" | "coin" | "emerald" | "ruby" | "moon" | "wax";
export const FAB_STYLES: { key: FabStyle; label: string; hint: string }[] = [
  { key: "seal", label: "Enamel seal", hint: "A dark seal with a gold plus in a notched gilt ring" },
  { key: "coin", label: "Gold coin", hint: "The original gold coin" },
  { key: "emerald", label: "Emerald seal", hint: "Forest-green enamel in a notched gilt ring" },
  { key: "ruby", label: "Ruby seal", hint: "Deep crimson enamel in a notched gilt ring" },
  { key: "moon", label: "Moonstone", hint: "Night-blue stone in a silver ring, with a silver plus" },
  { key: "wax", label: "Wax seal", hint: "A pressed red wax seal with a gold plus" },
];
const FAB_KEYS = new Set<string>(FAB_STYLES.map((f) => f.key));
export const PACES: { v: number; label: string }[] = [
  { v: 0.75, label: "Quick" },
  { v: 1, label: "As designed" },
  { v: 1.4, label: "Leisurely" },
];

export const FEEDBACK_HOLDS: { v: number; label: string }[] = [
  { v: 1.2, label: "Brief" },
  { v: 2.2, label: "A moment" },
  { v: 4, label: "Longer" },
  { v: 7, label: "Lingering" },
  { v: 0, label: "Until I close it" },
];

export type FeedbackStyle = "quiet" | "seal" | "crane" | "toucan";
export const FEEDBACK_STYLES: { key: FeedbackStyle; label: string; hint: string }[] = [
  { key: "quiet", label: "Submitted ✓", hint: "A clear check and “Feedback submitted”" },
  { key: "toucan", label: "To the Great Toucan Spirit", hint: "You hand him your letter; he accepts it and powers up" },
  { key: "seal", label: "Wax seal", hint: "The letter is sealed with a stamp and sparks" },
  { key: "crane", label: "Paper crane", hint: "Your note folds into a crane and flies off" },
];

export const FX_DEFAULTS: FxSettings = {
  rewardStyle: "classic",
  feedbackStyle: "quiet",
  cardStyle: "card",
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
    if (raw) {
      const saved = JSON.parse(raw);
      fx = { ...FX_DEFAULTS, ...saved };
      // The new default ("Submitted ✓") applies until a feedback style is chosen on purpose; the shooting star is retired.
      if (saved.fbv !== 2 || !FEEDBACK_STYLES.some((f) => f.key === fx.feedbackStyle)) fx.feedbackStyle = "quiet";
    }
  } catch {
    /* storage unavailable */
  }
  // Phones: fewer, glowier specks so the animation stays smooth.
  if (typeof window !== "undefined" && window.innerWidth < 600) {
    fx = { ...fx, dens: fx.dens * 0.6, embers: Math.round(fx.embers * 0.5) };
  }
  return fx;
}

/** Change a few settings from anywhere (not through Settings), on top of what's saved. */
export function patchFx(patch: Partial<FxSettings>): boolean {
  let saved: Partial<FxSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(FX_STORAGE_KEY) ?? "{}");
  } catch {}
  return saveFx({ ...FX_DEFAULTS, ...saved, ...patch } as FxSettings);
}

export function saveFx(fx: FxSettings): boolean {
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify({ ...fx, fbv: 2, savedAt: Date.now() }));
    window.dispatchEvent(new Event("fx-change"));
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

/** The + button's look, kept in step with Settings (the seal until the browser says otherwise). */
export function readFabStyle(): FabStyle {
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as { fabStyle?: FabStyle }).fabStyle : undefined;
    // "plain" was retired; it and anything unknown fall back to the seal.
    return v && FAB_KEYS.has(v) ? v : "seal";
  } catch {
    return "seal";
  }
}
export function subscribeFx(cb: () => void) {
  window.addEventListener("fx-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("fx-change", cb);
    window.removeEventListener("storage", cb);
  };
}

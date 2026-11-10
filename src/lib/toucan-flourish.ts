/** How the Great Toucan Spirit moves when it shares wisdom (kept per browser). */
export type Flourish = "leap" | "glow" | "bow" | "flutter" | "rise" | "still";
export const FLOURISHES: { key: Flourish; label: string; hint: string }[] = [
  { key: "glow", label: "Glow", hint: "a soft aura brightens around it" },
  { key: "bow", label: "Bow", hint: "a slow, gracious nod" },
  { key: "flutter", label: "Flutter", hint: "a little ruffle of the wings" },
  { key: "rise", label: "Float", hint: "drifts up a touch and settles" },
  { key: "leap", label: "Leap", hint: "the original happy jump" },
  { key: "still", label: "Still", hint: "no movement, just the words" },
];
const KEY = "toucan-flourish";
export function readFlourish(): Flourish {
  try {
    const v = localStorage.getItem(KEY);
    if (v && FLOURISHES.some((f) => f.key === v)) return v as Flourish;
  } catch {
    /* storage unavailable */
  }
  return "glow";
}
export function saveFlourish(f: Flourish) {
  try {
    localStorage.setItem(KEY, f);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent("toucan-flourish", { detail: f }));
}
export const flourishClass = (f: Flourish) => (f === "still" ? undefined : f === "leap" ? "toucan-tap" : `toucan-tap-${f}`);

/** How the "Talk with me" button on the toucan's speech bubble shows itself. */
export type TalkLook = "glow" | "words" | "glint";
export const TALK_LOOKS: { key: TalkLook; label: string; hint: string }[] = [
  { key: "glow", label: "A glowing star", hint: "a gold star on the bubble's corner, gently shining" },
  { key: "words", label: "Words", hint: "a small “Talk with me” under what he says" },
  { key: "glint", label: "A secret glint", hint: "faint, for those who know it's there" },
];
const TALK_KEY = "toucan-talk-look";
export function readTalkLook(): TalkLook {
  try {
    const v = localStorage.getItem(TALK_KEY);
    if (v && TALK_LOOKS.some((t) => t.key === v)) return v as TalkLook;
  } catch {
    /* storage unavailable */
  }
  return "glow";
}
export function saveTalkLook(t: TalkLook) {
  try {
    localStorage.setItem(TALK_KEY, t);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("toucan-talk-look"));
}
export function subscribeTalkLook(cb: () => void) {
  window.addEventListener("toucan-talk-look", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("toucan-talk-look", cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * His speech bubbles, everywhere he speaks (owner, Nov 10: "the user can choose the design and
 * interaction styles"). The look: storybook parchment or the spirit's glow. The way: just his words
 * first (a tap shows the rest), or everything showing.
 */
export type BubbleLook = "mixed" | "parchment" | "spirit";
export type BubbleWay = "mixed" | "quiet" | "full";
export const BUBBLE_LOOKS: { key: BubbleLook; label: string; hint: string }[] = [
  { key: "mixed", label: "Each place its own", hint: "parchment on the welcome screen, his glow in his notes" },
  { key: "parchment", label: "Storybook parchment", hint: "cream parchment with a gold edge, everywhere" },
  { key: "spirit", label: "Spirit glow", hint: "deep teal with a soft glow, everywhere" },
];
export const BUBBLE_WAYS: { key: BubbleWay; label: string; hint: string }[] = [
  { key: "mixed", label: "Each place its own", hint: "the welcome screen keeps it quiet; his notes show their buttons" },
  { key: "quiet", label: "Words first", hint: "just what he says; tap the bubble for answers and choices" },
  { key: "full", label: "Everything showing", hint: "his choices, the answer line and thumbs, right away" },
];
const LOOK_KEY = "toucan-bubble-look";
const WAY_KEY = "toucan-bubble-way";
const BUBBLE_EVENT = "toucan-bubble-style";
function readKey<T extends string>(key: string, list: { key: T }[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && list.some((t) => t.key === v)) return v as T;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}
export const readBubbleLook = (): BubbleLook => readKey(LOOK_KEY, BUBBLE_LOOKS, "mixed");
export const readBubbleWay = (): BubbleWay => readKey(WAY_KEY, BUBBLE_WAYS, "mixed");
export function saveBubbleStyle(patch: { look?: BubbleLook; way?: BubbleWay }) {
  try {
    if (patch.look) localStorage.setItem(LOOK_KEY, patch.look);
    if (patch.way) localStorage.setItem(WAY_KEY, patch.way);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(BUBBLE_EVENT));
}
export function subscribeBubbleStyle(cb: () => void) {
  window.addEventListener(BUBBLE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BUBBLE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
/** The two bubble colourways, shared by every place he speaks. */
export const BUBBLE_PAINT = {
  parchment: { bubble: { background: "#fffaf0", border: "1.5px solid #b39a6a", color: "#3d2f18", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }, tail: "#fffaf0", edge: "#b39a6a", soft: "#6b5631", btn: { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }, quietBtn: { color: "#6b5631" } },
  spirit: { bubble: { background: "linear-gradient(180deg, rgba(14,38,40,.96), rgba(8,22,26,.98))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 0 14px rgba(120,230,210,.3), 0 10px 28px rgba(0,0,0,.5)" }, tail: "rgba(10,28,32,.98)", edge: "rgba(140,240,220,.55)", soft: "rgba(232,255,248,.75)", btn: { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.6)", color: "#e8fff8" }, quietBtn: { color: "rgba(232,255,248,.8)" } },
} as const;

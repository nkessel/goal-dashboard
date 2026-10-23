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

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

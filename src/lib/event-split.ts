/**
 * Several events in one line: "headache, skipped lunch; long walk" logs three.
 * On unless turned off (the choice is remembered in this browser).
 */
const KEY = "event-split";

export function splitOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSplitOn(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}
/** The events in a line: split at commas and semicolons when on. */
export function splitEvents(text: string, on: boolean): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (!on) return [t];
  return t.split(/\s*[;,]\s*/).map((x) => x.trim()).filter(Boolean);
}

/**
 * Several events in one line: "headache; skipped lunch; long walk" logs three. A semicolon always separates
 * (owner, Nov 17: "have semicolon separate different events"); a comma only when turned on (owner, Nov 12: "comma
 * should not separate events logged"), remembered in this browser.
 */
const KEY = "event-split";

export function splitOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}
export function setSplitOn(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}
/** The events in a line: split at semicolons, and at commas too when on. */
export function splitEvents(text: string, on: boolean): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(on ? /\s*[;,]\s*/ : /\s*;\s*/).map((x) => x.trim()).filter(Boolean);
}

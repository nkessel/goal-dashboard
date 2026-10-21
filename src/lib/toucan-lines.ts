/**
 * Everything the Great Toucan Spirit says, in one place, so you can review
 * the lines in Settings and switch off any you don't like.
 */
export const SAY_FLYING = ["Wheee!", "To the skies!", "The winds obey me.", "Onward, to wisdom!", "Behold my majestic flight!", "Higher, friend, higher!", "I have soared over many forests."];
export const SAY_LANDING = [
  "Here I shall dispense wisdom.",
  "I approve of this spot.",
  "Ah. The view is excellent.",
  "This perch will do nicely.",
  "A fine branch, if I say so myself.",
  "Settled. Carry on, I'm watching.",
  "From here I can see everything.",
  "Mm. Sturdy. Good choice.",
  "I'll keep an eye on things from here.",
  "Comfortable. You may proceed.",
  "A toucan could get used to this.",
  "Landed with grace, as always.",
];
export const WISDOM = [
  "The longest quest begins with one small step. Take it.",
  "Rest is not retreat. Even spirits perch.",
  "Finish one thing, and the forest grows quieter.",
  "The river does not hurry, yet it reaches the sea.",
  "What you water, grows. Choose wisely.",
  "Courage is a feather: light, but it lifts you.",
  "Mistakes are maps. Read them, then fly on.",
  "The sun rises for those who show up again.",
  "Ask for help. Even the great toucan has a flock.",
  "Behold the compound interest of small good things done consistently.",
  "Make future {name} proud.",
  "I am the Great Toucan Spirit.",
  "I bless you with productivity, and flow, and great insight.",
  "Today's small quest is tomorrow's legend.",
  "The forest remembers every step you take. Keep walking.",
  "Your future self is watching — and cheering.",
  "One quest at a time, {name}. That is the whole secret.",
];
export const HIDING = ["Find me if you can…", "I shall hide. Seek wisely.", "Now you see me…"];
export const FOUND = ["You found me!", "Ha! Well spotted.", "A keen eye. I am impressed.", "Hide and seek is a sacred art."];

export const LINE_GROUPS: { key: string; title: string; hint: string; lines: string[] }[] = [
  { key: "wise", title: "Words of wisdom", hint: "When you tap the toucan", lines: WISDOM },
  { key: "land", title: "Landing", hint: "When you set it down", lines: SAY_LANDING },
  { key: "fly", title: "In flight", hint: "While you carry it", lines: SAY_FLYING },
  { key: "hide", title: "Hiding", hint: "When you hide it in a tab", lines: HIDING },
  { key: "found", title: "Found", hint: "When you find it again", lines: FOUND },
];

const KEY = "toucan-retired";
/** Lines you've switched off (kept on this device and on your account). */
export function retiredLines(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function setRetiredLines(lines: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable */
  }
}

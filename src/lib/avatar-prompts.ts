/**
 * Ready-made prompts for the avatar editor's sample chips — varied enough to
 * show off the range of epic RPG character art without anyone having to
 * think of a description themselves first. Deliberately not in ai-image.ts
 * (which is "server-only") since the avatar editor is a client component
 * and needs to read this list directly.
 */
export const SAMPLE_AVATAR_PROMPTS = [
  "battle-worn dwarven warrior with a braided beard and a glowing rune axe",
  "elven ranger with a longbow, hooded cloak, and forest-green leather armor",
  "armored paladin with a golden greatsword and a radiant halo",
  "rogue assassin in dark leathers with twin daggers and a scarred eye",
  "fire sorceress with flowing robes and flames swirling around her hands",
  "stone golem construct with glowing blue crystal veins",
  "half-orc barbarian with a massive warhammer and tribal war paint",
  "mystic druid wrapped in vines with antlers and glowing green eyes",
];

/**
 * Optional art-style presets for the generator — layered on top of the base
 * prompt (see buildAvatarPrompt in ai-image.ts, which already pushes toward
 * "epic, gritty, not cartoonish") to give the image a more specific mood.
 * Single-select in the UI; picking none just uses the base style. Shared
 * between the client component (rendering the buttons) and the server
 * action (building the prompt), so it isn't "server-only" like ai-image.ts.
 */
export const AVATAR_STYLE_OPTIONS: { key: string; label: string; description: string; promptSuffix: string }[] = [
  {
    key: "dark-fantasy",
    label: "Dark Fantasy",
    description: "Shadowy, gothic, moody",
    promptSuffix: ", shadowy gothic dark fantasy aesthetic, desaturated moody palette, eerie atmospheric fog",
  },
  {
    key: "epic-cinematic",
    label: "Epic Cinematic",
    description: "Movie-poster, larger than life",
    promptSuffix: ", epic cinematic movie-poster composition, dramatic rim lighting, larger-than-life heroic scale",
  },
  {
    key: "grimdark-war",
    label: "Grimdark War",
    description: "Battle-scarred, brutal, war-torn",
    promptSuffix: ", grimdark war-torn aesthetic, scars and grime, brutal battle damage, harsh desaturated tones",
  },
  {
    key: "mythic-legend",
    label: "Mythic Legend",
    description: "Ancient, godlike, awe-inspiring",
    promptSuffix: ", mythic legendary godlike presence, ancient glowing runes, awe-inspiring epic scale",
  },
];

/** Turns a chosen style key into a prompt clause, or "" when none is
 * chosen (or the key doesn't match, e.g. stale client state). */
export function buildStyleSuffix(styleKey: string | null | undefined): string {
  const style = AVATAR_STYLE_OPTIONS.find((s) => s.key === styleKey);
  return style ? style.promptSuffix : "";
}

/**
 * Ready-made prompts for the avatar editor's sample chips — varied enough to
 * show off the range of epic RPG character art without anyone having to
 * think of a description themselves first. Deliberately not in ai-image.ts
 * (which is "server-only") since the avatar editor is a client component
 * and needs to read this list directly.
 */
export const SAMPLE_AVATAR_PROMPTS = [
  "wise old owl sage in a starry indigo cloak, holding a brass lantern",
  "snowy owl knight in silver armor with a feathered helm",
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
 * The three avatar art styles. Each one fully defines the look (the base
 * prompt in ai-image.ts only adds framing and background), so the choices
 * read as genuinely different styles rather than moods of one style. Every
 * style has an example portrait of the same subject (STYLE_EXAMPLE_SUBJECT),
 * shown as the style's selector tile in the avatar editor.
 */
export const AVATAR_STYLE_OPTIONS: { key: string; label: string; description: string; look: string }[] = [
  {
    key: "storybook",
    label: "Storybook",
    description: "Simple, hand-drawn animated storybook look",
    look:
      "simple animated storybook cartoon, like a classic 2D hand-drawn animated film, clean bold outlines, " +
      "flat cel colors with soft simple shading, big friendly expressive eyes, rounded simple shapes, cheerful, " +
      "minimal detail, not realistic, not 3D",
  },
  {
    key: "heroic",
    label: "Heroic",
    description: "Painterly fantasy book-cover art",
    look:
      "painterly fantasy illustration, traditional oil painting with visible brushstrokes, deep saturated color, " +
      "rich greens, browns and gold, strong dramatic light and shadow, heroic and confident, fantasy book-cover art, " +
      "hand-painted, fully colored, not a sketch, not pale, not a 3D render, not CGI",
  },
  {
    key: "pixel",
    label: "Pixel",
    description: "16-bit retro game sprite",
    look:
      "16-bit SNES-era JRPG character sprite, clearly pixelated with every square pixel visible, limited 16-color " +
      "palette, dark 1-pixel outline, simple dithered shading, retro game sprite, not smooth, no anti-aliasing",
  },
];

export const DEFAULT_AVATAR_STYLE = "heroic";

/** Subject used for every style's example tile, so the tiles differ only in style. */
export const STYLE_EXAMPLE_SUBJECT = "a friendly ranger with a longbow, a hooded green cloak and leather armor";

export function styleLook(styleKey: string | null | undefined): string {
  const style =
    AVATAR_STYLE_OPTIONS.find((s) => s.key === styleKey) ??
    AVATAR_STYLE_OPTIONS.find((s) => s.key === DEFAULT_AVATAR_STYLE)!;
  return style.look;
}

/** @deprecated styles now fully define the look; see styleLook(). */
export function buildStyleSuffix(): string {
  return "";
}

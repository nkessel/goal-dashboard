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
 * The three avatar art styles. Each one fully defines the look (the base
 * prompt in ai-image.ts only adds framing and background), so the choices
 * read as genuinely different styles rather than moods of one style. Every
 * style has an example portrait of the same subject (STYLE_EXAMPLE_SUBJECT),
 * shown as the style's selector tile in the avatar editor.
 */
export const AVATAR_STYLE_OPTIONS: { key: string; label: string; description: string; look: string }[] = [
  {
    key: "storybook",
    label: "Storybook Painted",
    description: "Soft watercolor and ink, like a fairy-tale book",
    look:
      "vintage storybook illustration in the manner of Arthur Rackham and Beatrix Potter, loose pen-and-ink " +
      "outlines with pale transparent watercolor washes, muted earthy sepia palette, visible textured watercolor " +
      "paper grain, whimsical slightly exaggerated proportions, flat and hand-drawn, not 3D, not glossy",
  },
  {
    key: "heroic",
    label: "Heroic Game Art",
    description: "Bold, crisp fantasy RPG character art",
    look:
      "hyper-detailed fantasy RPG character portrait, painterly digital concept art like a AAA game character card, " +
      "rich saturated color, dramatic rim lighting, crisp detail on armor and gear, heroic and confident, sharp focus",
  },
  {
    key: "pixel",
    label: "Pixel Hero",
    description: "Chunky 16-bit retro video-game sprite",
    look:
      "8-bit NES-era pixel art sprite, extremely low resolution 32x32 sprite scaled up with huge chunky square " +
      "pixels, only about 8 flat colors, thick 1-pixel black outline, no shading gradients, no anti-aliasing, " +
      "simple iconic retro video game character",
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

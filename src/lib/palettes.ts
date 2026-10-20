/**
 * Colour themes for the Adventure look: the same forest, parchment and gold,
 * lit differently. Each recolours the backdrop, the bottom bar and the glow;
 * parchment cards stay parchment so everything stays readable.
 */
export type PaletteKey = "forest" | "moonlit" | "ember" | "tide" | "dusk" | "frost" | "canyon" | "grove";

export const PALETTES: { key: PaletteKey; label: string; blurb: string; sky: [string, string]; accent: string }[] = [
  { key: "forest", label: "Forest", blurb: "Deep green woods (the original)", sky: ["#3a3f2e", "#1d241c"], accent: "#d9b45f" },
  { key: "moonlit", label: "Moonlit", blurb: "Indigo night, silver light", sky: ["#2b3466", "#0d1029"], accent: "#e3cf8a" },
  { key: "ember", label: "Ember", blurb: "A hearth in a dark hall", sky: ["#6a2a18", "#1f0b06"], accent: "#e9a45a" },
  { key: "tide", label: "Tide", blurb: "Sea-green depths and brass", sky: ["#14555a", "#061c20"], accent: "#d8b866" },
  { key: "dusk", label: "Dusk", blurb: "Plum and rose at sunset", sky: ["#5a2a5a", "#1a0a1e"], accent: "#e8b46e" },
  { key: "frost", label: "Frost", blurb: "Cool slate and pale gold", sky: ["#45556a", "#141a24"], accent: "#e6d39a" },
  { key: "canyon", label: "Canyon", blurb: "Red rock and warm sand", sky: ["#7a4222", "#24120a"], accent: "#e8b45e" },
  { key: "grove", label: "Spring grove", blurb: "Bright new leaves", sky: ["#4f7a3a", "#1e3418"], accent: "#e8c86a" },
];

export function isPalette(v: unknown): v is PaletteKey {
  return typeof v === "string" && PALETTES.some((p) => p.key === v);
}

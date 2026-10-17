/** The level others see: an honorary level when one is set, otherwise the earned one. */
export function shownLevel(p: { level: number; display_level?: number | null }): number {
  return p.display_level ?? p.level;
}

/** A sub-habit as the completion rule sees it: `optional` ones don't count toward finishing the habit (owner, Nov 14). */
export type StepLike = { id: string; optional?: boolean };

/**
 * Whether these ticks finish the habit: true once every required sub-habit is ticked,
 * false while one isn't, and null when none is required (ticking never finishes it on its own).
 */
export function stepsComplete(steps: StepLike[], isTicked: (id: string) => boolean): boolean | null {
  const required = steps.filter((st) => !st.optional);
  if (!required.length) return null;
  return required.every((st) => isTicked(st.id));
}

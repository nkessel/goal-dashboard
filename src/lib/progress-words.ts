/**
 * Progress in words, never "0/5" (owner: fractions are demoralizing; asked 3+ times):
 * nothing done yet → "5 sub-quests"; some → "3 to go"; all → "✓ all done".
 */
export function progressWords(done: number, total: number, noun = "sub-quest"): string {
  if (total <= 0) return "";
  if (done >= total) return "✓ all done";
  if (done <= 0) return `${total} ${noun}${total === 1 ? "" : "s"}`;
  return `${total - done} to go`;
}

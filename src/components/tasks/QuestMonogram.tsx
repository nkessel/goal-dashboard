/**
 * A quest with no picture yet: a blank parchment disc in a thin gold ring (owner, Nov 4:
 * "default portrait a blank circle, not letters"). `id`/`title` stay for callers.
 */
export function QuestMonogram({ size }: { id: string; title: string; size: number }) {
  return (
    <span
      aria-hidden
      className="flex h-full w-full select-none rounded-full"
      style={{
        background: "radial-gradient(circle at 35% 30%, #fffaf0, #f3e6c6 60%, #e6d3a6)",
        boxShadow: `inset 0 0 0 ${size >= 40 ? 2 : 1.5}px rgba(168,138,63,.75), inset 0 -2px 4px rgba(90,60,10,.12)`,
      }}
    />
  );
}

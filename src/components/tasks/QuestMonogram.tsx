/**
 * The stand-in portrait for a quest with no artwork: its initials pressed
 * into a coloured wax disc. The colour comes from the quest's id, so each
 * quest keeps its own look and neighbours on the map rarely match.
 */
const WAX = ["#8e2b25", "#3d7448", "#3a5795", "#a33a59", "#b0632a", "#6b4c8a", "#2f6f73", "#7a5a1e"];
const SKIP = new Set(["a", "an", "the", "of", "to", "my", "and", "for", "on", "in", "with", "at", "by", "up", "out"]);

export function questInitials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const pick = (meaningful.length > 0 ? meaningful : words).slice(0, 2);
  const letters = pick.map((w) => w.replace(/^['-]+/, "")[0] ?? "").join("");
  return (letters || "?").toUpperCase();
}

export function questWax(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return WAX[h % WAX.length];
}

export function QuestMonogram({ id, title, size }: { id: string; title: string; size: number }) {
  const wax = questWax(id);
  const initials = questInitials(title);
  return (
    <span
      aria-hidden
      className="font-display flex h-full w-full select-none items-center justify-center rounded-full"
      style={{
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.28), rgba(255,255,255,0) 55%), ${wax}`,
        boxShadow: "inset 0 -2px 4px rgba(0,0,0,.35), inset 0 0 0 2px rgba(0,0,0,.15)",
        color: "#f6ead0",
        fontSize: Math.round(size * (initials.length > 1 ? 0.4 : 0.5)),
        fontWeight: 600,
        letterSpacing: initials.length > 1 ? "-0.02em" : undefined,
        textShadow: "0 1px 1px rgba(0,0,0,.45)",
        lineHeight: 1,
      }}
    >
      {initials}
    </span>
  );
}

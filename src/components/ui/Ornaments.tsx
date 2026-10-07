/**
 * Shared Adventure-theme ornaments, matching the Today's Quests reference art:
 * chapter-style section titles (rule — leaf — Title — leaf — rule) and the
 * gilded shield crest used on the Additional Quests bar.
 */

/** A fading gold rule. `dir` is which way it fades out toward. */
export function GoldRule({ dir, tone = "gold" }: { dir: "left" | "right"; tone?: "gold" | "ink" }) {
  const c = tone === "gold" ? "217,180,95" : "139,112,64";
  return (
    <span
      aria-hidden
      className="h-px min-w-3 flex-1"
      style={{
        background: `linear-gradient(${dir === "left" ? "270deg" : "90deg"}, rgba(${c},.75), rgba(${c},0))`,
      }}
    />
  );
}

export function Leaf({ flip, size = 26 }: { flip?: boolean; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static /design asset
    <img
      src="/design/ui-leaf.png"
      alt=""
      aria-hidden
      width={size}
      height={Math.round(size * 0.77)}
      className="shrink-0"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    />
  );
}

/**
 * Centered section title with leaves and fading rules either side.
 * `tone="ink"` is for titles sitting on parchment rather than the dark forest.
 */
export function SectionTitle({
  children,
  as: Tag = "h2",
  tone = "gold",
  size = 26,
  aside,
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  tone?: "gold" | "ink";
  size?: number;
  /** Small trailing content after the right rule (e.g. "Today's XP: 380"). */
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <GoldRule dir="left" tone={tone} />
      <Leaf flip size={Math.round(size * 0.95)} />
      <Tag
        className="font-display m-0 whitespace-nowrap leading-none"
        style={{
          fontSize: size,
          color: tone === "gold" ? "var(--t-cream)" : "var(--t-ink)",
          textShadow: tone === "gold" ? "0 2px 8px rgba(0,0,0,.45)" : undefined,
        }}
      >
        {children}
      </Tag>
      <Leaf size={Math.round(size * 0.95)} />
      <GoldRule dir="right" tone={tone} />
      {aside}
    </div>
  );
}

/** Gilded heater shield with a compass star — the Additional Quests crest. */
export function QuestShield({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.13)} viewBox="0 0 30 34" fill="none" aria-hidden>
      <defs>
        <linearGradient id="qs-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8e3a0" />
          <stop offset=".5" stopColor="#d9b45f" />
          <stop offset="1" stopColor="#8a6c2c" />
        </linearGradient>
        <linearGradient id="qs-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#465c3e" />
          <stop offset="1" stopColor="#1d281b" />
        </linearGradient>
      </defs>
      <path
        d="M15 1.2 27.8 5.8v9.7c0 8.6-5.8 14.4-12.8 17.3C8 29.9 2.2 24.1 2.2 15.5V5.8Z"
        fill="url(#qs-gold)"
        stroke="#4a3913"
        strokeWidth="1"
      />
      <path
        d="M15 4.5 24.8 8v7.6c0 6.8-4.5 11.5-9.8 13.9C9.7 27.1 5.2 22.4 5.2 15.6V8Z"
        fill="url(#qs-field)"
        stroke="rgba(0,0,0,.35)"
        strokeWidth=".6"
      />
      <path d="M15 9.2l1.55 5.9 5.85 1.6-5.85 1.6L15 24.2l-1.55-5.9-5.85-1.6 5.85-1.6Z" fill="url(#qs-gold)" />
      <path d="M15 12.6l.7 2.6 2.6.7-2.6.7-.7 2.6-.7-2.6-2.6-.7 2.6-.7Z" fill="#fff3c9" opacity=".55" transform="rotate(45 15 16.7)" />
      <circle cx="15" cy="16.7" r="1.25" fill="#22301f" />
    </svg>
  );
}

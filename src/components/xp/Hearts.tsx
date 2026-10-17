/** HP as five hearts (in halves). Missed non-negotiables cost half a heart; quests heal. */
export function Hearts({ hp }: { hp: number }) {
  const label = `HP ${hp / 2} of 5 hearts — an evening non-negotiable left undone costs half a heart; each finished quest heals half a heart.`;
  return (
    <span className="flex items-center justify-center gap-[3px]" title={label} aria-label={label} role="img">
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(2, hp - i * 2)); // 0, 1 (half) or 2 (full)
        return (
          <span key={i} className="relative inline-block h-[17px] w-[17px]">
            {/* empty heart */}
            <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden>
              <path d="M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 4.5 6.8 4.5c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3 3.8 0 5.8 3.9 4.4 7.2C19.5 16.4 12 21 12 21z" fill="rgba(20,14,10,.55)" stroke="#8a2f22" strokeWidth="1.6" />
            </svg>
            {fill > 0 && (
              <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden style={fill === 1 ? { clipPath: "inset(0 50% 0 0)" } : undefined}>
                <defs>
                  <radialGradient id={`hp-g-${i}`} cx=".35" cy=".3" r=".8">
                    <stop offset="0" stopColor="#ff8f7a" />
                    <stop offset=".55" stopColor="#d23b2a" />
                    <stop offset="1" stopColor="#8a1f15" />
                  </radialGradient>
                </defs>
                <path d="M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 4.5 6.8 4.5c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3 3.8 0 5.8 3.9 4.4 7.2C19.5 16.4 12 21 12 21z" fill={`url(#hp-g-${i})`} stroke="#5a140d" strokeWidth="1.4" />
                <path d="M7 8.2c.8-1 1.9-1.4 3-1.1" fill="none" stroke="#ffd2c8" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
              </svg>
            )}
          </span>
        );
      })}
    </span>
  );
}

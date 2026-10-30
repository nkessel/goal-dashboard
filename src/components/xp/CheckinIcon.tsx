import type { CheckinIconKey } from "@/lib/celebration-fx";

/** The Check in button's icon: fine gold-line drawings in the app's storybook manner, in the button's own colour. */
export function CheckinIcon({ icon, size = 18 }: { icon: CheckinIconKey; size?: number }) {
  if (icon === "none") return null;
  const p = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {icon === "sun" && (
        <g {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </g>
      )}
      {icon === "leaf" && (
        <g {...p}>
          <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
          <path d="M5 19l8-8" />
        </g>
      )}
      {icon === "flame" && (
        <g {...p}>
          <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4 2 1.3 2.6 3.2 2.6 4.6 1-.8 1.6-2 1.7-3.4 2.4 1.8 4.3 4.3 4.3 7.2 0 3.2-2.4 5.6-6 5.6z" />
          <path d="M12 21c-1.5 0-2.5-1-2.5-2.4 0-1.5 1.2-2.3 2.5-3.8 1.3 1.5 2.5 2.3 2.5 3.8 0 1.4-1 2.4-2.5 2.4z" />
        </g>
      )}
      {icon === "compass" && (
        <g {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </g>
      )}
      {icon === "lantern" && (
        <g {...p}>
          <circle cx="12" cy="3.6" r="1.4" />
          <path d="M9 7.5l1.2-2.5h3.6L15 7.5M7.5 7.5h9M8.5 7.5C6.6 10 6.6 15.5 8.5 18h7c1.9-2.5 1.9-8 0-10.5M7.5 18h9l-1 2.5h-7z" />
          <path d="M12 10c-1.2 1.3-1.7 2.3-1.7 3.2a1.7 1.7 0 003.4 0c0-.9-.5-1.9-1.7-3.2z" />
        </g>
      )}
      {icon === "heart" && (
        <g {...p}>
          <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0112 7.6 4.2 4.2 0 0119.5 10c0 5.4-7.5 10-7.5 10z" />
        </g>
      )}
      {icon === "feather" && (
        <g {...p}>
          <path d="M19 4.5c-6 .5-11 5-12 12.5l-2 3" />
          <path d="M7 17c5 .5 10-3.5 12-12.5M10 14h4.5M12 11h4" />
        </g>
      )}
      {icon === "moon" && (
        <g {...p}>
          <path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z" />
        </g>
      )}
    </svg>
  );
}

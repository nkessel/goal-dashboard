"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { useVisualFx, type LoadingLook } from "@/lib/visual-fx";
import { DAILY_LINES, rotationFor } from "@/lib/greetings";
import { ownLines } from "@/lib/welcome";
import { loadFx } from "@/lib/celebration-fx";

/**
 * While the next screen loads (after a short beat, so quick loads show
 * nothing), a small flourish in the chosen look: a flying toucan, a turning
 * compass or a writing quill. Shown by CSS from html[data-nav-pending].
 */
export function NavLoader() {
  const fx = useVisualFx();
  const [pick, setPick] = useState<{ n: number; tip: string | null }>({ n: 0, tip: null });
  // Each wait draws again from the looks that are on, and a fresh wise line from your rotation.
  useEffect(() => {
    const html = document.documentElement;
    let was = html.hasAttribute("data-nav-pending");
    const mo = new MutationObserver(() => {
      const now = html.hasAttribute("data-nav-pending");
      if (now && !was) setPick({ n: Math.floor(Math.random() * 1000), tip: wiseLine() });
      was = now;
    });
    mo.observe(html, { attributes: true, attributeFilter: ["data-nav-pending"] });
    return () => mo.disconnect();
  }, []);
  const looks = fx.loadingLooks;
  const look = looks[pick.n % looks.length] ?? "toucan";
  const tip = fx.loadingTips ? pick.tip : null;
  if (look === "bar" && !tip) return null;
  return (
    <div className="nav-loader" aria-hidden>
      {look !== "bar" && <LoadingArt look={look} />}
      {tip && <LoadingTip line={tip} />}
    </div>
  );
}

/** A line from the welcome screen's wise lines (your own ones too, none you retired). */
function wiseLine(): string {
  try {
    const { liked, fresh } = rotationFor(new Date().toISOString().slice(0, 10), ownLines(loadFx()));
    const pool = [...liked, ...fresh];
    return pool[Math.floor(Math.random() * pool.length)] ?? DAILY_LINES[0];
  } catch {
    return DAILY_LINES[Math.floor(Math.random() * DAILY_LINES.length)];
  }
}

/** The wise line under the loading look: a parchment ribbon that rises in. */
export function LoadingTip({ line }: { line: string }) {
  return (
    <span className="nav-loader-tip">
      <span className="nlt-star">✦</span>
      <span className="nlt-text">{line}</span>
      <span className="nlt-star">✦</span>
    </span>
  );
}

/** Fireflies' spots in their 170×100 field: left %, top %, size px, depth (0 far … 1 near), path. */
const FLIES: [number, number, number, number, number][] = [
  [12, 58, 5, 0.4, 0],
  [24, 26, 7, 1, 1],
  [33, 70, 4, 0.2, 2],
  [44, 40, 8, 1, 0],
  [52, 14, 4, 0.3, 1],
  [61, 62, 6, 0.8, 2],
  [72, 30, 5, 0.5, 0],
  [80, 74, 7, 0.9, 1],
  [88, 44, 4, 0.3, 2],
  [36, 48, 3, 0.1, 1],
  [66, 86, 3, 0.2, 0],
];

/** The art for one loading look (also the Settings preview). */
export function LoadingArt({ look }: { look: LoadingLook }) {
  if (look === "toucan")
    return (
      <span className="nav-loader-toucan">
        <ToucanArt flying size={58} />
      </span>
    );
  if (look === "compass")
    return (
      <svg className="nav-loader-compass" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="rgba(42,28,16,.88)" stroke="#d9b45f" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(217,180,95,.45)" strokeWidth="1" strokeDasharray="2 4" />
        <path d="M32 8l5 24-5 24-5-24z" fill="#f2d27e" stroke="#8a6116" strokeWidth=".8" />
        <path d="M8 32l24-5 24 5-24 5z" fill="#c99a2e" stroke="#8a6116" strokeWidth=".8" opacity=".8" />
        <path d="M32 8l5 24h-10z" fill="#b0342a" />
        <circle cx="32" cy="32" r="3" fill="#2a1c10" stroke="#f2d27e" />
      </svg>
    );
  if (look === "quill")
    return (
      <svg className="nav-loader-quill" width="96" height="56" viewBox="0 0 96 56">
        <rect x="2" y="30" width="92" height="22" rx="4" fill="rgba(236,218,180,.95)" stroke="#a88a3f" />
        <path className="nav-loader-ink" d="M10 42c6-5 10 5 16 0s10-6 16 0 10 5 16 0 10-6 16 0 8 4 12 0" fill="none" stroke="#3b2a14" strokeWidth="2" strokeLinecap="round" />
        <g className="nav-loader-pen">
          <path d="M14 40L40 4c4 2 6 6 4 10L18 42z" fill="#f6ecd2" stroke="#6b5631" strokeWidth="1.2" />
          <path d="M14 40l4 2-6 3z" fill="#2a1c10" />
        </g>
      </svg>
    );
  if (look === "fireflies")
    return (
      <span className="nav-loader-flies">
        {FLIES.map(([x, y, size, near, path], i) => (
          <i
            key={i}
            className={`nlf-path${path}`}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                filter: near < 0.35 ? "blur(1px)" : undefined,
                "--d": `${2.8 + ((i * 7) % 5) * 0.45}s`,
                "--g": `${1.3 + ((i * 3) % 4) * 0.35}s`,
                "--o": `${-i * 0.37}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
    );
  if (look === "pages")
    return (
      <span className="nav-loader-book">
        <b className="nb-cover" />
        <b className="nb-page nb-left" />
        <b className="nb-page nb-right" />
        <b className="nb-flip">
          <b className="nb-face nb-front" />
          <b className="nb-face nb-back" />
        </b>
        <b className="nb-flip nb-flip2">
          <b className="nb-face nb-front" />
          <b className="nb-face nb-back" />
        </b>
        <b className="nb-ribbon" />
      </span>
    );
  return null;
}

const VISITS = "visit-counts";
const noop = () => () => {};

/**
 * Counts which screens you open, and while nothing is happening, quietly
 * loads your most-visited ones so they open faster. Off in Settings.
 */
export function IdlePreload() {
  const pathname = usePathname();
  const router = useRouter();
  const fx = useVisualFx();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => {
    if (!mounted) return;
    const key = pathname.split("?")[0].replace(/\/[0-9a-f-]{20,}.*$/, "");
    try {
      const counts = JSON.parse(localStorage.getItem(VISITS) ?? "{}") as Record<string, number>;
      counts[key] = (counts[key] ?? 0) + 1;
      localStorage.setItem(VISITS, JSON.stringify(counts));
    } catch {
      /* storage unavailable */
    }
  }, [pathname, mounted]);
  useEffect(() => {
    if (!mounted || !fx.preload) return;
    let idle: number | undefined;
    let timer: number | undefined;
    const run = () => {
      try {
        const counts = JSON.parse(localStorage.getItem(VISITS) ?? "{}") as Record<string, number>;
        const here = pathname.split("?")[0];
        Object.entries(counts)
          .filter(([p]) => p !== here && p.startsWith("/") && !p.startsWith("/api") && !p.startsWith("/dev-preview"))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .forEach(([p]) => router.prefetch(p));
      } catch {
        /* storage unavailable */
      }
    };
    // Wait for a few quiet seconds, then load in the browser's idle time.
    const quiet = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
        if (ric) idle = ric(run);
        else run();
      }, 3000);
    };
    quiet();
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, quiet, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle !== undefined && cic) cic(idle);
      events.forEach((e) => window.removeEventListener(e, quiet));
    };
  }, [pathname, fx.preload, mounted, router]);
  return null;
}

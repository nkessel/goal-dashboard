"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/** The direction the next calendar change should slide (set just before navigating). */
let nextDir: "left" | "right" | "fade" | null = null;

/**
 * Keep a picture of what's showing now, so it can slide away while the new
 * range slides in from the other side once it arrives.
 */
function prepareSlide(dir: "left" | "right" | "fade") {
  nextDir = dir;
  const box = document.querySelector<HTMLElement>("[data-cal-slide]");
  const current = box?.querySelector<HTMLElement>(":scope > [data-cal-page]");
  if (!box || !current) return;
  box.querySelectorAll(":scope > [data-cal-ghost]").forEach((n) => n.remove());
  const ghost = current.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-cal-page");
  ghost.setAttribute("data-cal-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = "position:absolute;inset:0 0 auto 0;pointer-events:none;z-index:2;";
  box.appendChild(ghost);
  // If the page never changes (an error, the same range), don't leave it hanging.
  window.setTimeout(() => ghost.isConnected && ghost.remove(), 6000);
}

/**
 * A calendar link that slides the view: the old range moves out one way
 * while the new one comes in from the other (see CalendarSlide).
 */
export function SlideLink({
  dir,
  href,
  children,
  ...rest
}: { dir: "left" | "right" | "fade"; href: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href" | "onClick">) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        prepareSlide(dir);
      }}
      onPointerEnter={() => router.prefetch(href)}
      {...rest}
    >
      {children}
    </Link>
  );
}

/**
 * The calendar body. When the range or view changes, the old picture slides
 * out one way while the new one slides in from the other.
 */
export function CalendarSlide({ slideKey, children }: { slideKey: string; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    const dir = nextDir ?? "fade";
    nextDir = null;
    const page = box.querySelector<HTMLElement>(":scope > [data-cal-page]");
    const ghost = box.querySelector<HTMLElement>(":scope > [data-cal-ghost]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      ghost?.remove();
      return;
    }
    const opts: KeyframeAnimationOptions = { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" };
    if (dir === "fade") {
      page?.animate([{ opacity: 0, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
      ghost?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out" }).finished.then(() => ghost.remove(), () => ghost.remove());
      return;
    }
    const out = dir === "left" ? "-100%" : "100%";
    const inn = dir === "left" ? "100%" : "-100%";
    page?.animate([{ transform: `translateX(${inn})`, opacity: 0.4 }, { transform: "none", opacity: 1 }], opts);
    if (ghost) ghost.animate([{ transform: "none", opacity: 1 }, { transform: `translateX(${out})`, opacity: 0.2 }], opts).finished.then(() => ghost.remove(), () => ghost.remove());
  }, [slideKey]);
  return (
    <div ref={boxRef} data-cal-slide className="relative overflow-hidden">
      <div data-cal-page>{children}</div>
    </div>
  );
}

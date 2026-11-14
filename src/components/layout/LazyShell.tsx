"use client";

import dynamic from "next/dynamic";

/**
 * Big always-mounted parts that draw nothing until the page is in the browser (they render
 * through portals, after mount): they load in their own files after the first paint instead of
 * with every screen's first JavaScript, so the app opens sooner (owner, Nov 12: "load faster").
 */
export const ToucanGuide = dynamic(() => import("@/components/toucan/ToucanGuide").then((m) => m.ToucanGuide), { ssr: false });
export const FeedbackDock = dynamic(() => import("@/components/feedback/FeedbackDock").then((m) => m.FeedbackDock), { ssr: false });
export const LanguageWindow = dynamic(() => import("@/components/xp/LearnLanguage").then((m) => m.LanguageWindow), { ssr: false });
export const PackingWindow = dynamic(() => import("@/components/settings/PackingLists").then((m) => m.PackingWindow), { ssr: false });
export const Walkthrough = dynamic(() => import("@/components/tour/Walkthrough").then((m) => m.Walkthrough), { ssr: false });

"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StandInNav } from "@/components/layout/BottomNav";
import { markStandInSwap } from "@/lib/standin";

export type StandInTab = "today" | "calendar" | "boards" | "matrix" | "insights" | "feed";

const noop = () => () => {};
/** The app's look, as the last screen put it on <body> (a stand-in can't wait for the profile). */
function useBodyAttr(name: "data-theme" | "data-palette") {
  return useSyncExternalStore(
    noop,
    () => document.body.getAttribute(name),
    () => null
  );
}

function Panel({ h, adv }: { h: number; adv: boolean }) {
  return (
    <div
      aria-hidden
      className={`inv-loading rounded-2xl ${adv ? "parchment parchment-framed" : ""}`}
      style={{ minHeight: h, ...(adv ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }) }}
    />
  );
}
function Pills({ adv }: { adv: boolean }) {
  return (
    <div
      aria-hidden
      className="inv-loading h-11 rounded-full"
      style={{ background: adv ? "var(--t-nav-bg)" : "var(--t-accent-soft)", border: adv ? "1px solid rgba(209,161,60,.35)" : undefined }}
    />
  );
}

/**
 * What a bottom-bar tab shows the moment it's tapped, while its real screen loads: the tab's own
 * frame and title, the bottom bar, and a few faint panels in the app's panel styling. Real content
 * replaces it in place. Used by each tab's loading.tsx.
 */
export function TabStandIn({ tab }: { tab: StandInTab }) {
  const theme = useBodyAttr("data-theme") === "calm" ? "calm" : "adventure";
  const palette = useBodyAttr("data-palette") ?? undefined;
  const isAdventure = theme === "adventure";
  const wide = tab !== "feed";
  const widthClass = wide ? "max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl" : "max-w-md sm:max-w-lg md:max-w-xl";

  // When the real screen takes over, let the slide and the wait marker know.
  useLayoutEffect(() => {
    return () => {
      markStandInSwap();
      const html = document.documentElement;
      if (html.getAttribute("data-nav-pending") === "standin") html.removeAttribute("data-nav-pending");
    };
  }, []);

  let body: React.ReactNode;
  switch (tab) {
    case "today":
      body = (
        <div className="flex flex-col gap-4 pt-10">
          <Panel h={120} adv={isAdventure} />
          <Panel h={72} adv={isAdventure} />
          <Panel h={72} adv={isAdventure} />
          <Panel h={72} adv={isAdventure} />
        </div>
      );
      break;
    case "calendar":
      body = (
        <div className="flex flex-col gap-4">
          <PageHeader isAdventure={isAdventure} title="Quest Calendar" calmTitle="Calendar" />
          <Pills adv={isAdventure} />
          <Panel h={440} adv={isAdventure} />
        </div>
      );
      break;
    case "boards":
      body = (
        <div className="flex flex-col gap-4">
          <PageHeader isAdventure={isAdventure} title="All Quests" calmTitle="All quests" subtitle="Your quests by board" />
          <Pills adv={isAdventure} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Panel key={i} h={120} adv={isAdventure} />
            ))}
          </div>
        </div>
      );
      break;
    case "matrix":
      body = (
        <div className="flex flex-col gap-5">
          <PageHeader isAdventure={isAdventure} title="All Quests" calmTitle="All quests" subtitle="Weigh every quest — by the classic matrix, or by everything at once" />
          <Pills adv={isAdventure} />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Panel key={i} h={150} adv={isAdventure} />
            ))}
          </div>
        </div>
      );
      break;
    case "insights":
      body = (
        <div className="flex flex-col gap-4">
          <PageHeader isAdventure={isAdventure} title="Insights" calmTitle="Insights" subtitle="What your check-ins and quests are telling you" />
          <Panel h={180} adv={isAdventure} />
          <Panel h={200} adv={isAdventure} />
        </div>
      );
      break;
    case "feed":
      body = (
        <div className="flex flex-col gap-5">
          <PageHeader isAdventure={isAdventure} title="Guild Hall" calmTitle="Friends" />
          <Panel h={84} adv={isAdventure} />
          <Panel h={160} adv={isAdventure} />
          <Panel h={160} adv={isAdventure} />
        </div>
      );
      break;
  }

  return (
    <div data-app-shell data-theme={theme} data-palette={palette} className="flex min-h-screen flex-col items-center">
      <div data-app-bg data-theme={theme} data-palette={palette} aria-hidden />
      <div className={`flex w-full flex-1 flex-col ${widthClass}`}>
        <div className="relative flex items-center gap-2.5 px-5 pt-3">
          <span className="flex-1" />
          <span aria-hidden className="h-10 w-10 shrink-0" />
        </div>
        <main data-standin aria-busy className="flex-1 px-5 pb-36 pt-2">
          {body}
        </main>
      </div>
      <StandInNav />
    </div>
  );
}

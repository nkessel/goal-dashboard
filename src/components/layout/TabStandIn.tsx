"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StandInNav } from "@/components/layout/BottomNav";
import { markStandInSwap } from "@/lib/standin";
import { StandInChromeHold } from "@/components/layout/ShellChrome";
import { StandInBell } from "@/components/layout/NotificationsButton";
import { StandInAvatar } from "@/components/layout/TopRightAvatar";
import { CreateFab } from "@/components/create/CreateFab";

export type StandInTab = "today" | "calendar" | "boards" | "matrix" | "insights" | "feed";

const noop = () => () => {};
// On a full page load the server sends this stand-in first and the screen after it: until the screen has
// settled, its folds don't replay their opening slide (globals.css, data-quiet-reveal).
const QUIET_REVEAL = `(function(){var h=document.documentElement;h.setAttribute("data-quiet-reveal","");function off(){setTimeout(function(){h.removeAttribute("data-quiet-reveal")},700)}if(document.readyState==="complete")off();else addEventListener("load",off);setTimeout(function(){h.removeAttribute("data-quiet-reveal")},15000)})()`;
const isServer = () => true;
const isClient = () => false;
/** The app's look, as the last screen put it on <body> (a stand-in can't wait for the profile). */
function useBodyAttr(name: "data-theme" | "data-palette") {
  return useSyncExternalStore(
    noop,
    () => document.body.getAttribute(name),
    () => null
  );
}

type Tone = "parch" | "dark";

/** A panel in the app's own styling, with a slow gold shine sweeping across (none with reduced motion). */
function Panel({ adv, tone = "parch", h, className = "", children }: { adv: boolean; tone?: Tone; h?: number; className?: string; children?: React.ReactNode }) {
  const look: React.CSSProperties = !adv
    ? { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }
    : tone === "dark"
      ? { background: "rgba(20,26,16,.82)", border: "1.5px solid rgba(209,161,60,.55)", color: "#f1e6c8" }
      : { color: "#5a421e" };
  return (
    <div aria-hidden className={`si-shine relative overflow-hidden rounded-2xl ${adv && tone === "parch" ? "parchment parchment-framed" : ""} ${className}`} style={{ minHeight: h, ...look }}>
      {children}
    </div>
  );
}
/** A faint bar where words will be (in the panel's own ink). */
function Bar({ w, h = 10, className = "", round = false }: { w: number | string; h?: number; className?: string; round?: boolean }) {
  return <span aria-hidden className={`si-bar block ${round ? "rounded-full" : "rounded-md"} ${className}`} style={{ width: typeof w === "number" ? `${w}%` : w, height: h }} />;
}
/** A pill-shaped button, outlined in the panel's ink (w in px, or any CSS width). */
function PillShape({ w, h = 34, className = "" }: { w: number | string; h?: number; className?: string }) {
  return <span aria-hidden className={`si-pill block max-w-full rounded-full ${className}`} style={{ width: w, height: h }} />;
}
/** The bar of tabs or a search field under a screen's title, on the dark ground. */
function GroundPill({ adv, h = 44 }: { adv: boolean; h?: number }) {
  return (
    <div
      aria-hidden
      className="si-shine relative overflow-hidden rounded-full"
      style={{ height: h, background: adv ? "var(--t-nav-bg)" : "var(--t-accent-soft)", border: adv ? "1px solid rgba(209,161,60,.35)" : undefined }}
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
  // Only in the server's HTML (a full page load); a stand-in drawn on a tap in the app has no script.
  const fromServer = useSyncExternalStore(noop, isClient, isServer);
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

  const a = isAdventure;
  let body: React.ReactNode;
  switch (tab) {
    case "today":
      // Your portrait between your numbers, the XP bar and Check in, then the day's parts.
      body = (
        <div className="flex flex-col gap-4">
          <div aria-hidden className="flex flex-col items-center gap-2 pt-1" style={{ color: a ? "#f1e6c8" : "var(--t-ink)" }}>
            <Bar w={34} h={16} />
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex w-[26%] flex-col gap-4">
                <Bar w="70%" h={12} />
                <Bar w="80%" h={12} />
              </div>
              <span className="si-bar si-shine relative block h-[100px] w-[100px] shrink-0 overflow-hidden rounded-full" />
              <div className="flex w-[26%] flex-col items-end gap-4">
                <Bar w="70%" h={12} />
                <Bar w="60%" h={12} />
              </div>
            </div>
            <Bar w={42} h={8} round />
            <PillShape w={140} h={40} />
          </div>
          <Panel adv={a} h={64} className="flex items-center gap-3 px-4">
            <Bar w={28} h={28} />
            <div className="flex flex-1 flex-col gap-2">
              <Bar w={40} />
              <Bar w={70} h={8} />
            </div>
          </Panel>
          <Panel adv={a} tone="dark" h={200} className="flex flex-col items-center gap-4 px-4 py-4">
            <Bar w={45} h={14} />
            <PillShape w={110} h={30} />
            <div className="si-inset min-h-[110px] w-full rounded-xl" />
          </Panel>
          <Panel adv={a} tone="dark" h={64} className="flex items-center justify-center">
            <Bar w={36} h={14} />
          </Panel>
        </div>
      );
      break;
    case "calendar":
      // The week grid: day names along the top, hours down the side, faint hour lines.
      body = (
        <div className="flex flex-col gap-4">
          <PageHeader isAdventure={a} title="Quest Calendar" calmTitle="Calendar" />
          <GroundPill adv={a} />
          <Panel adv={a} h={440} className="flex flex-col px-3 py-3">
            <div className="flex gap-2 pb-3 pl-9">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <Bar w={60} h={9} />
                  <Bar w={45} h={9} />
                </div>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-1 items-start gap-2 border-t pt-1.5" style={{ borderColor: "color-mix(in srgb, currentColor 14%, transparent)", minHeight: 52 }}>
                <Bar w={28} h={9} className="shrink-0" />
              </div>
            ))}
          </Panel>
        </div>
      );
      break;
    case "boards":
    case "matrix":
      body = (
        <div className="flex flex-col gap-4">
          {tab === "boards" ? (
            <PageHeader isAdventure={a} title="All Quests" calmTitle="All quests" subtitle="Your quests by board" />
          ) : (
            <PageHeader isAdventure={a} title="All Quests" calmTitle="All quests" subtitle="Weigh every quest — by the classic matrix, or by everything at once" />
          )}
          <GroundPill adv={a} h={48} />
          <GroundPill adv={a} h={42} />
          {/* Board scrolls: a title, a count, the next step. */}
          <div className="grid grid-cols-2 items-start gap-x-2 gap-y-3 sm:gap-x-3 lg:grid-cols-3">
            {[170, 132, 196, 150].map((h, i) => (
              <Panel key={i} adv={a} h={h} className="flex flex-col gap-2.5 px-3.5 pb-3 pt-4">
                <Bar w={78} h={14} />
                <Bar w={42} h={8} />
                <span className="mt-auto" />
                <Bar w={46} h={8} />
                <div className="flex items-center gap-2">
                  <span className="si-pill block h-4 w-4 shrink-0 rounded-full" />
                  <Bar w={70} h={9} />
                </div>
              </Panel>
            ))}
          </div>
        </div>
      );
      break;
    case "insights":
      // The Check in card (last night's two pills, the sleep faces, the slider), the check-ins list, the chart button.
      body = (
        <div className="flex flex-col gap-4">
          <PageHeader isAdventure={a} title="Insights" calmTitle="Insights" subtitle="What your check-ins and quests are telling you" />
          <Panel adv={a} className="flex flex-col items-center gap-4 px-4 pb-5 pt-5">
            <Bar w={30} h={16} />
            <div className="si-inset flex w-full flex-col items-center gap-3 rounded-xl px-3 py-3">
              <Bar w={30} h={8} />
              <div className="flex w-full items-center justify-between gap-3">
                <PillShape w="40%" h={36} />
                <PillShape w="40%" h={36} />
              </div>
              <div className="flex gap-3">
                <PillShape w={110} h={28} />
                <PillShape w={80} h={28} />
              </div>
            </div>
            <Bar w={45} h={11} />
            <div className="flex w-full justify-between gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="si-pill block h-[52px] flex-1 rounded-lg" />
              ))}
            </div>
            <div className="flex w-full items-center gap-3">
              <Bar w={18} />
              <Bar w={30} h={6} round />
            </div>
            <div className="flex w-full items-center gap-3">
              <Bar w={22} h={8} />
              <Bar w={12} h={8} />
            </div>
            <div className="si-inset flex min-h-[86px] w-full flex-col gap-3 rounded-xl px-3 py-3">
              <Bar w={22} />
              <Bar w={80} h={8} />
              <Bar w={70} h={8} />
            </div>
            <PillShape w={190} h={40} />
          </Panel>
          <Panel adv={a} h={160} className="flex flex-col gap-3 px-4 py-4">
            <Bar w={40} h={14} />
            <Bar w={85} h={9} />
            <Bar w={75} h={9} />
            <Bar w={80} h={9} />
          </Panel>
        </div>
      );
      break;
    case "feed":
      // The champion, the invite (with its two buttons), finding your party, this week in the party.
      body = (
        <div className="flex flex-col gap-5">
          <PageHeader isAdventure={a} title="Guild Hall" calmTitle="Friends" />
          <Panel adv={a} tone="dark" h={92} className="flex items-center gap-3 px-4">
            <span className="si-bar block h-14 w-14 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Bar w={45} h={9} />
              <Bar w={60} h={14} />
              <Bar w={80} h={8} />
            </div>
          </Panel>
          <Panel adv={a} tone="dark" h={154} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="si-bar block h-12 w-12 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Bar w={70} h={14} />
                <Bar w={90} h={8} />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <PillShape w={130} h={42} />
              <PillShape w={100} h={42} />
            </div>
          </Panel>
          <Panel adv={a} h={176} className="flex flex-col gap-4 px-4 py-4">
            <Bar w={50} h={14} />
            <PillShape w="100%" h={40} />
            <div className="flex items-center gap-3">
              <span className="si-bar block h-8 w-8 rounded-full" />
              <Bar w={35} />
            </div>
          </Panel>
          <Panel adv={a} h={140} className="flex flex-col gap-3 px-4 py-4">
            <Bar w={60} h={16} />
            <Bar w={85} h={9} />
            <Bar w={85} h={9} />
          </Panel>
        </div>
      );
      break;
  }

  return (
    <div data-app-shell data-theme={theme} data-palette={palette} className="flex min-h-screen flex-col items-center">
      <div data-app-bg data-theme={theme} data-palette={palette} aria-hidden />
      {fromServer && <script dangerouslySetInnerHTML={{ __html: QUIET_REVEAL }} />}
      <div className={`flex w-full flex-1 flex-col ${widthClass}`}>
        {/* The bell and the corner button stay, and work, through the switch (TI-6D). */}
        <div className="relative flex items-center gap-2.5 px-5 pt-3">
          <span className="flex-1" />
          <StandInBell />
          <span aria-hidden className="h-10 w-10 shrink-0" />
        </div>
        <main data-standin aria-busy className="flex-1 px-5 pb-36 pt-2">
          {body}
        </main>
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center">
        <div className={`flex w-full justify-end px-5 ${widthClass}`}>
          <div className="pointer-events-auto relative">
            <StandInAvatar />
          </div>
        </div>
      </div>
      <StandInNav />
      {/* The +, the feedback chat and a running focus timer stay through the switch (TI-6A..C). */}
      <StandInChromeHold />
      {tab === "boards" ? (
        <CreateFab kinds={["board", "quest", "journal"]} initial="board" theme={theme} label="New quest board" />
      ) : (
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      )}
    </div>
  );
}

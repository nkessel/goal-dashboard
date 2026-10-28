"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { settingsPopupContextAction, toucanPrefsAction } from "@/app/actions";
import { useEscape } from "@/lib/use-escape";
import { GearIcon } from "./Icons";
import type { SettingsSpot } from "./SettingsGear";

// The same pieces Settings shows, loaded only when a gear is tapped.
const WelcomeSettings = dynamic(() => import("@/components/settings/CelebrationSettings").then((m) => m.WelcomeSettings));
const CelebrationSettings = dynamic(() => import("@/components/settings/CelebrationSettings").then((m) => m.CelebrationSettings));
const VictoriesHeaderSettings = dynamic(() => import("@/components/settings/VisualFxSettings").then((m) => m.VictoriesHeaderSettings));
const ToucanSettings = dynamic(() => import("@/components/settings/ToucanSettings").then((m) => m.ToucanSettings));
const ToucanLookSettings = dynamic(() => import("@/components/settings/ToucanSettings").then((m) => m.ToucanLookSettings));
const PartyViewSettings = dynamic(() => import("@/components/social/PartyView").then((m) => m.PartyViewSettings));
const NotificationPrefs = dynamic(() => import("@/components/settings/NotificationPrefs").then((m) => m.NotificationPrefs));
const PlanningSettings = dynamic(() => import("@/components/settings/PlanningSettings").then((m) => m.PlanningSettings));
const QuestEditorLayoutSettings = dynamic(() => import("@/components/settings/QuestEditorLayoutSettings").then((m) => m.QuestEditorLayoutSettings));

const TITLES: Record<SettingsSpot, string> = {
  "welcome-screen": "Welcome Screen",
  "visual-effects.celebrations": "Celebrations",
  "visual-effects.victories": "Victories Today",
  "toucan-spirit": "Toucan Spirit",
  "party-view": "Guild Hall",
  notifications: "Notifications",
  planning: "Planning & evening",
  "menus.quest-editor": "Quest editor",
};

type Ctx = { notifyLevel: string; notifyEmail: boolean; admin: boolean; toucan: { mode: "simple" | "lite" | "full"; retired: string[] } };

/**
 * A gear's settings, right where you are: the same controls as that section
 * of Settings, in a popup over the screen you're on. Changes apply as you
 * make them; "All settings" goes to the full section.
 */
export function SettingsPopup({ spot, onClose, beforeLeave }: { spot: SettingsSpot; onClose: () => void; beforeLeave?: () => void }) {
  const router = useRouter();
  const [isAdventure] = useState(() => document.body.getAttribute("data-theme") !== "calm");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const needsCtx = spot === "notifications" || spot === "planning" || spot === "toucan-spirit";
  useEscape(onClose);
  useEffect(() => {
    if (!needsCtx) return;
    let live = true;
    Promise.all([
      settingsPopupContextAction().catch(() => ({ notifyLevel: "all", notifyEmail: true, admin: false })),
      spot === "toucan-spirit" ? toucanPrefsAction().catch(() => null) : Promise.resolve(null),
    ]).then(([c, t]) => live && setCtx({ ...c, toucan: { mode: t?.mode ?? "full", retired: t?.retired ?? [] } }));
    return () => {
      live = false;
    };
  }, [needsCtx, spot]);

  const head = isAdventure ? "font-display text-[15px]" : "text-sm font-bold";
  const loading = (
    <p className="m-0 py-4 text-center text-sm" style={{ color: "var(--t-ink-soft)" }}>
      Opening…
    </p>
  );
  const body: Record<SettingsSpot, () => React.ReactNode> = {
    "welcome-screen": () => <WelcomeSettings />,
    "visual-effects.celebrations": () => <CelebrationSettings />,
    "visual-effects.victories": () => (
      <>
        <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Tap its title to close it. Its header then shows:
        </p>
        <VictoriesHeaderSettings />
      </>
    ),
    "toucan-spirit": () =>
      ctx ? (
        <>
          <ToucanSettings initialMode={ctx.toucan.mode} initialRetired={ctx.toucan.retired} />
          <div className="mt-2 flex flex-col gap-3 pt-3" style={{ borderTop: "1px solid var(--t-card-border)" }}>
            <h4 className={`m-0 ${head}`} style={{ color: "var(--t-ink)" }}>
              His look
            </h4>
            <ToucanLookSettings />
          </div>
        </>
      ) : (
        loading
      ),
    "party-view": () => <PartyViewSettings isAdventure={isAdventure} />,
    notifications: () => (ctx ? <NotificationPrefs level={ctx.notifyLevel} email={ctx.notifyEmail} /> : loading),
    planning: () => (ctx ? <PlanningSettings isAdventure={isAdventure} withPair={ctx.admin} /> : loading),
    "menus.quest-editor": () => (
      <>
        <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          What shows straight away when you make or edit a quest, and what waits under Advanced settings.
        </p>
        <QuestEditorLayoutSettings />
      </>
    ),
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TITLES[spot]} settings`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`card-pop-in flex max-h-[min(640px,86dvh)] w-[min(480px,100%)] flex-col overflow-hidden rounded-2xl ${isAdventure ? "parchment" : ""}`}
        style={{ ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }), boxShadow: "0 18px 40px rgba(0,0,0,.45)" }}
      >
        <header className="relative z-[1] flex shrink-0 items-center gap-2 px-4 pb-2 pt-3" style={{ borderBottom: `1px solid ${isAdventure ? "rgba(139,112,64,.35)" : "var(--t-card-border)"}` }}>
          <span style={{ color: isAdventure ? "#8a6c2c" : "var(--t-ink-soft)" }}>
            <GearIcon size={17} />
          </span>
          <h2 className={`m-0 min-w-0 flex-1 truncate ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`} style={{ color: "var(--t-ink)" }}>
            {TITLES[spot]}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </header>
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3" style={{ color: "var(--t-ink)" }}>
          {body[spot]()}
        </div>
        <footer className="relative z-[1] flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.35)" : "var(--t-card-border)"}` }}>
          <button
            type="button"
            onClick={() => {
              onClose();
              beforeLeave?.();
              router.push(`/settings?open=${spot}`);
            }}
            className="text-[13px] underline underline-offset-2"
            style={{ color: "var(--t-ink-soft)" }}
          >
            All settings ›
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-full px-4 text-[14px] font-bold"
            style={isAdventure ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" }}
          >
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

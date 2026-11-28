"use client";

import { CreateFabView } from "@/components/create/CreateFab";
import { FocusTimerPill } from "@/components/one-thing/FocusTimerPill";
import { FeedbackDock } from "@/components/layout/LazyShell";
import { useChromeHold, useShellChrome, type ShellLook } from "@/lib/shell-chrome";

/**
 * The buttons that float over every screen, drawn once for the whole app (root layout): the +, the
 * feedback chat and the focus timer pill. They show while a screen (or a tab's stand-in) holds them,
 * stay mounted through the stand-in → real screen swap (TI-6), and start fresh on a real navigation.
 */
export function ShellChromeHost() {
  const { look, holds, gen, fab } = useShellChrome();
  const on = holds > 0 && !!look;
  return (
    <>
      {fab && <CreateFabView key={`fab-${gen}`} {...fab} />}
      {on && look && <FocusTimerPill theme={look.theme} />}
      {on && look && <FeedbackDock key={`fb-${gen}`} theme={look.theme} />}
    </>
  );
}

/** Placed by AppShell: this screen wants the floating buttons, in its look. */
export function ShellChromeHold({ look }: { look: ShellLook }) {
  useChromeHold("shell", look);
  return null;
}

/** Placed by a tab's stand-in: keep the floating buttons as the last screen had them. */
export function StandInChromeHold() {
  useChromeHold("standin");
  return null;
}

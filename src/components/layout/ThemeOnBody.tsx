"use client";

import { useEffect } from "react";

/** Mirrors the app theme onto <body> so dialogs portaled there get the theme's colors and fonts. */
export function ThemeOnBody({ theme }: { theme: "calm" | "adventure" }) {
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}

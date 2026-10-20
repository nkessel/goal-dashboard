"use client";

import { useEffect } from "react";

/** Mirrors the app theme (and colour theme) onto <body> so dialogs portaled there get the theme's colors and fonts. */
export function ThemeOnBody({ theme, palette = null }: { theme: "calm" | "adventure"; palette?: string | null }) {
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    if (palette) document.body.setAttribute("data-palette", palette);
    else document.body.removeAttribute("data-palette");
  }, [theme, palette]);
  return null;
}

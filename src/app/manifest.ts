import type { MetadataRoute } from "next";

/**
 * The app as an installable web app (owner, Nov 8: offline in Chrome on iPhone showed the Dino game).
 * Chrome on iPhone can't run the offline helper (`public/sw.js`) in a normal tab; added to the Home
 * Screen, the app opens on its own with Safari's engine, where the helper runs and kept screens open offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Goal Dashboard",
    short_name: "Quests",
    description: "Personal + social goal & task dashboard",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#14231a",
    theme_color: "#14231a",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

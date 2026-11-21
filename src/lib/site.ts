/**
 * The app's public address. Google sign-in sends people back here, and the privacy and terms
 * pages name it. Set NEXT_PUBLIC_SITE_URL in Vercel to move the app (e.g. https://tinyquests.win)
 * once that domain points at this project and is listed in Google Cloud Console's redirect URIs.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://goal-dashboard-kappa.vercel.app").replace(/\/+$/, "");

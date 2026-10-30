import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel, EB_Garamond, Manrope, Noto_Naskh_Arabic } from "next/font/google";
import { ViewTransitionProvider } from "@/components/ui/ViewTransitionProvider";
import { KeyboardViewport } from "@/components/ui/KeyboardViewport";
import { ScrollLock } from "@/components/ui/ScrollLock";
import { ContextMenuBridge } from "@/components/ui/ContextMenuBridge";
import { MenuLayoutStyles } from "@/components/settings/MenuLayoutSettings";
import { SaveKeys } from "@/components/ui/SaveKeys";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Adventure theme typography (visual redesign to match the RPG mockups):
// Cinzel for display/headings, EB Garamond for body text.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  weight: ["500", "700"],
  subsets: ["latin"],
});
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});
// Calm theme typography — one sans-serif family for everything.
/** For titles written in Arabic script (Arabic, Balochi, Persian, Urdu…). */
const naskh = Noto_Naskh_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: false,
});

const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goal Dashboard",
  description: "Personal + social goal & task dashboard",
};

// The on-screen keyboard slides over the page on Android too (as it always does
// on iPhone), so the page never resizes; KeyboardViewport fits only the popup
// you're typing in.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The keyboard slides over the page instead of squashing the whole layout.
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({ children, drawer }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The welcome screen's fog is set on it before the app loads.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${ebGaramond.variable} ${manrope.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <KeyboardViewport />
        <ScrollLock />
        <ContextMenuBridge />
        <MenuLayoutStyles />
        <SaveKeys />
        <ViewTransitionProvider>
          {children}
          {drawer}
        </ViewTransitionProvider>
      </body>
    </html>
  );
}

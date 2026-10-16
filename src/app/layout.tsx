import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel, EB_Garamond, Manrope } from "next/font/google";
import { ViewTransitionProvider } from "@/components/ui/ViewTransitionProvider";
import { KeyboardViewport } from "@/components/ui/KeyboardViewport";
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
const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goal Dashboard",
  description: "Personal + social goal & task dashboard",
};

// Android: let the on-screen keyboard shrink the page, so popups and fixed
// bars sit above it instead of under it. (iPhone ignores this; KeyboardViewport
// handles it there.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children, drawer }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${ebGaramond.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <KeyboardViewport />
        <ViewTransitionProvider>
          {children}
          {drawer}
        </ViewTransitionProvider>
      </body>
    </html>
  );
}

"use client";

import { useState } from "react";
import { Fold } from "@/components/ui/Fold";

/**
 * Find a setting by name (owner, Nov 4: "allow me to search the settings — I can't find the loading
 * screen settings"). Each entry names its section and, inside it, its folded group; picking one opens
 * both right here and brings it into view with the spotlight glow.
 */
type Entry = { label: string; where: string; row: string; group?: string; words?: string };
const ENTRIES: Entry[] = [
  { label: "Theme & colours", where: "Visual settings", row: "visual", group: "theme", words: "calm adventure palette colour color dark light look avatar" },
  { label: "Layout", where: "Visual settings", row: "visual", group: "layout", words: "editor menu order quest editor parts arrange" },
  { label: "Celebrations", where: "Visual settings", row: "visual", group: "celebrations", words: "confetti dust sparks complete fanfare" },
  { label: "While a screen loads", where: "Visual settings", row: "visual", group: "loading", words: "loading screen spinner toucan loader transition page change" },
  { label: "Scale colours", where: "Visual settings", row: "visual", group: "scale-colors", words: "importance urgency difficulty energy bars" },
  { label: "Evening Routine button", where: "Visual settings", row: "visual", group: "evening-button", words: "stars glow evening" },
  { label: "The + button", where: "Visual settings", row: "visual", group: "fab", words: "plus fab add button" },
  { label: "Victories Today, when closed", where: "Visual settings", row: "visual", group: "victories", words: "wins completed done header" },
  { label: "His speech bubble", where: "Toucan Spirit › His look", row: "toucan-spirit", group: "his-look", words: "toucan bubble look parchment spirit glow words first everything showing buttons interaction style design" },
  { label: "Toucan Spirit", where: "Toucan", row: "toucan-spirit", words: "bird guide talk speak voice chat look add-ons hats" },
  { label: "Welcome screen", where: "Welcome screen", row: "welcome-screen", words: "check-in greeting morning castle wise line daily login mist" },
  { label: "Evening routine & planning", where: "Planning & evening", row: "planning", words: "evening start time rites planning walks tomorrow" },
  { label: "Account & sign out", where: "Account", row: "account", words: "email google sign out log out" },
  { label: "Calendar sync", where: "Account", row: "account", words: "google calendar connect sync" },
  { label: "Notifications", where: "Notifications", row: "notifications", words: "email alerts messages bell" },
  { label: "Guild Hall", where: "Guild Hall", row: "party-view", words: "party friends feed social" },
  { label: "Privacy & sharing", where: "Privacy & Security", row: "privacy-security", words: "public private share" },
  { label: "Download your data", where: "Your Data", row: "your-data", words: "export json backup" },
  { label: "Help", where: "Help & Support", row: "help-support", words: "support contact" },
];

function score(e: Entry, q: string) {
  const hay = `${e.label} ${e.where} ${e.words ?? ""}`.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length || !terms.every((t) => hay.includes(t))) return 0;
  return e.label.toLowerCase().startsWith(terms[0]) ? 2 : 1;
}

/** Opens a section (and one of its groups), then scrolls to it with a glow. */
export function revealSetting(row: string, group?: string) {
  const box = document.querySelector<HTMLElement>(`[data-settings-row="${row}"]`);
  if (!box) return;
  const toggle = box.querySelector<HTMLButtonElement>("[data-settings-toggle]");
  if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
  window.setTimeout(() => {
    const g = group ? box.querySelector<HTMLElement>(`[data-settings-group="${group}"]`) : null;
    g?.dispatchEvent(new Event("settings-group-open"));
    const target = g ?? box;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.remove("settings-spotlight");
    void target.offsetWidth;
    target.classList.add("settings-spotlight");
  }, 340);
}

export function SettingsSearch({ isAdventure }: { isAdventure: boolean }) {
  const [q, setQ] = useState("");
  const found = q.trim() ? ENTRIES.map((e) => [e, score(e, q)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 6) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex h-11 items-center gap-2 rounded-full px-4" style={{ background: isAdventure ? "rgba(246,236,210,.92)" : "var(--t-card)", border: `1px solid ${isAdventure ? "#a88a3f" : "var(--t-card-border)"}`, boxShadow: "inset 0 1px 3px rgba(60,40,10,.18)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#7a6034" }}>
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" />
          <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
            if (e.key === "Enter" && found[0]) {
              revealSetting(found[0].row, found[0].group);
              setQ("");
            }
          }}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          style={{ color: "#2a1c10" }}
        />
      </label>
      <Fold open={!!q.trim()}>
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl p-1" style={{ background: "rgba(246,236,210,.96)", border: "1px solid #a88a3f" }}>
          {found.length === 0 ? (
            <li className="px-3 py-2 text-[14px] italic" style={{ color: "#6b5631" }}>
              No setting by that name.
            </li>
          ) : (
            found.map((e) => (
              <li key={`${e.row}.${e.group ?? ""}.${e.label}`} className="due-in">
                <button
                  type="button"
                  onClick={() => {
                    revealSetting(e.row, e.group);
                    setQ("");
                  }}
                  className="hover-glow flex min-h-10 w-full items-baseline gap-2 rounded-xl px-3 text-left"
                  style={{ color: "#2a1c10" }}
                >
                  <span className="text-[15px] font-semibold">{e.label}</span>
                  <span className="truncate text-[12.5px]" style={{ color: "#6b5631" }}>
                    {e.where}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </Fold>
    </div>
  );
}

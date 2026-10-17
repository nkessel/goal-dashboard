"use client";

import { useState, useTransition } from "react";
import { setNotifyPrefsAction } from "@/app/actions";

const LEVELS = [
  { key: "all", label: "Everything", hint: "Cheers, comments, level-ups and the rest" },
  { key: "highlights", label: "Highlights", hint: "Comments, requests, calls for support — no taps" },
  { key: "essential", label: "Only what needs me", hint: "Party requests, calls for support, reminders" },
] as const;

/** How much the app tells you, and whether the important things also come by email. */
export function NotificationPrefs({ level: initialLevel, email: initialEmail }: { level: string; email: boolean }) {
  const [level, setLevel] = useState(initialLevel);
  const [email, setEmail] = useState(initialEmail);
  const [, startTransition] = useTransition();
  function save(patch: { level?: string; email?: boolean }) {
    startTransition(async () => {
      await setNotifyPrefsAction(patch).catch(() => {});
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Notification level" className="flex flex-col gap-1.5">
        {LEVELS.map((l) => {
          const on = l.key === level;
          return (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => (setLevel(l.key), save({ level: l.key }))}
              className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
              style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
            >
              <span className="text-[14px] font-bold">{l.label}</span>
              <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                {l.hint}
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm" style={{ color: "var(--t-ink)" }}>
        <input type="checkbox" checked={email} onChange={(e) => (setEmail(e.target.checked), save({ email: e.target.checked }))} />
        Also email me about comments, calls for support and reminders
      </label>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setAppDefaultsAction } from "@/app/actions";
import { SHAREABLE_SETTINGS } from "@/lib/settings-defaults";

function readAll(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const { key } of SHAREABLE_SETTINGS) {
    try {
      out[key] = window.localStorage.getItem(key);
    } catch {
      out[key] = null;
    }
  }
  return out;
}

/**
 * For the app's owner: after changing a setting here, a small text button
 * offers to make it the default for every account (devices that haven't
 * chosen that setting themselves start from it).
 */
export function SetAsDefault() {
  const base = useRef<Record<string, string | null> | null>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    base.current = readAll();
    let t: number | undefined;
    const check = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (!base.current) return;
        const now = readAll();
        const diff = SHAREABLE_SETTINGS.filter(({ key }) => now[key] !== base.current![key]).map((s) => s.key);
        setChanged((prev) => (prev.length === diff.length && prev.every((k, i) => k === diff[i]) ? prev : diff));
        if (diff.length) setDone(false);
      }, 120);
    };
    const events = ["click", "change", "input", "pointerup", "keyup"] as const;
    for (const e of events) document.addEventListener(e, check, true);
    window.addEventListener("storage", check);
    return () => {
      window.clearTimeout(t);
      for (const e of events) document.removeEventListener(e, check, true);
      window.removeEventListener("storage", check);
    };
  }, []);

  function share() {
    setError(null);
    const now = readAll();
    const values = Object.fromEntries(changed.map((k) => [k, now[k]]));
    start(async () => {
      try {
        await setAppDefaultsAction(values);
        base.current = { ...base.current, ...values };
        setChanged([]);
        setDone(true);
        window.setTimeout(() => setDone(false), 2600);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the defaults.");
      }
    });
  }

  if (!changed.length && !done && !error) return null;
  const labels = SHAREABLE_SETTINGS.filter((s) => changed.includes(s.key)).map((s) => s.label);
  return (
    <div className="fade-in pointer-events-none fixed inset-x-0 bottom-24 z-[45] flex justify-center px-4">
      <div
        className="pointer-events-auto flex max-w-[460px] items-center gap-2 rounded-full px-4 py-2 text-[13.5px]"
        style={{ background: "rgba(24,20,13,.94)", border: "1px solid rgba(217,180,95,.55)", color: "var(--t-cream, #efe6cc)", boxShadow: "0 8px 22px rgba(0,0,0,.4)" }}
      >
        {done ? (
          <span>✓ Now the default for all accounts</span>
        ) : error ? (
          <span role="alert">{error}</span>
        ) : (
          <>
            <button type="button" onClick={share} disabled={pending} className="font-semibold underline underline-offset-2 disabled:opacity-60" style={{ color: "#f2d27e" }}>
              {pending ? "Saving…" : "Set as default for all accounts"}
            </button>
            <span className="min-w-0 truncate opacity-75" title={labels.join(", ")}>
              {labels.join(", ")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

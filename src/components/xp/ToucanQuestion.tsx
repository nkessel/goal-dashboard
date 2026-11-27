"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { addJournalEntryAction } from "@/app/actions";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { AskBackground } from "@/components/settings/ToucanSettings";
import { GearIcon } from "@/components/ui/Icons";
import { loadFx, subscribeFx } from "@/lib/celebration-fx";
import { keepImportant } from "@/lib/toucan-kept";

/**
 * The toucan's question (owner, Nov 19): instead of the full welcome screen, the Great Toucan Spirit asks
 * "What's most important right now?" over a grey mist, like the old welcome fog. Your words are written on a gold
 * line, never in a box. Continue saves them to today's journal and closes; Keep it saves them too and leaves a
 * small floating target you can open all day (KeptTarget). Its background and mist are set in Settings › Toucan
 * Spirit › His look.
 */
export function ToucanQuestion({ onClose, preview = false }: { onClose: () => void; preview?: boolean }) {
  const bg = useSyncExternalStore(subscribeFx, () => loadFx().toucanAskBg ?? "mist", () => "mist");
  const mist = useSyncExternalStore(subscribeFx, () => loadFx().toucanAskMist ?? 0.7, () => 0.7);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  // The card's gear (owner, Nov 21: "We have a settings button in the top right too, right?"): what's behind him,
  // how thick the mist is and the wise line, in a panel above the card.
  const [tuning, setTuning] = useState(false);
  // The part of the screen you can see (smaller with a phone's keyboard up), so the card stays centred in it.
  const [view, setView] = useState<{ top: number; h: number } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portals need the browser's document
    setReady(true);
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setView({ top: vv.offsetTop, h: vv.height });
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const thick = Math.max(0, Math.min(1, Number(mist) || 0));
  // Nothing of the page shows through (owner, Nov 19: "should completely obscure what's behind it").
  const bgKey = bg === "clear" ? "mist" : bg;
  const fog = hour < 5 || hour >= 21 ? "night" : hour < 9 ? "dawn" : hour < 17 ? "day" : "dusk";

  const finish = (keep: boolean) => {
    const words = text.trim();
    // A preview from Settings saves nothing.
    if (!words || preview) return close();
    setBusy(true);
    setError(null);
    addJournalEntryAction(`Most important: ${words}`, null, "important")
      .then((entry) => {
        if (keep) keepImportant(words, entry?.id ?? null);
        close();
      })
      .catch((e) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      });
  };
  const close = () => {
    setLeaving(true);
    setTimeout(onClose, 320);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!ready) return null;
  return createPortal(
    <div className={`tq-root fixed inset-0 z-[80] ${leaving ? "tq-out" : "tq-in"}`} role="dialog" aria-modal="true" aria-label="What's most important right now?" data-toucan-question>
      <div aria-hidden className="tq-mist absolute inset-0" data-bg={bgKey} data-fog={fog} style={{ ["--mist" as string]: String(thick) }} />
      {/* Centred in what you can see (owner, Nov 19: "more centered"), above a phone's keyboard. */}
      <div className="absolute inset-x-0 flex flex-col items-center justify-center px-4" style={view ? { top: view.top, height: view.h } : { top: 0, bottom: 0 }}>
      <div className="relative flex w-full max-w-[400px] flex-col items-center">
        <div className="drawer-body w-full" data-open={tuning ? "true" : undefined}>
          <div className="drawer-inner">
            <div className="parchment mb-3 rounded-2xl px-4 py-3" data-toucan-ask-tune style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
              <AskBackground />
            </div>
          </div>
        </div>
        <div className="tq-toucan mb-2">
          <ToucanArt size={92} />
        </div>
        <div className="tq-card relative w-full rounded-[18px] px-5 pb-4 pt-4" style={{ background: "linear-gradient(160deg, rgba(18,51,47,.95), rgba(10,32,29,.97))", border: "1.2px solid rgba(217,180,95,.75)", boxShadow: "0 16px 36px rgba(0,0,0,.45)", color: "#f3e7c6" }}>
          <button
            type="button"
            onClick={() => setTuning((v) => !v)}
            aria-pressed={tuning}
            aria-label={tuning ? "Close the toucan's settings" : "The toucan's settings"}
            title="Settings"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: "rgba(217,180,95,.8)", background: tuning ? "rgba(217,180,95,.18)" : undefined }}
          >
            <GearIcon size={15} />
          </button>
          <div className="pr-8 text-[11.5px] uppercase tracking-[.16em]" style={{ color: "#d9b45f" }}>
            {hello}
          </div>
          <h2 className="font-display m-0 mt-1 text-[24px] font-semibold leading-tight">What&rsquo;s most important right now?</h2>
          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                finish(false);
              }
            }}
            rows={1}
            aria-label="What's most important right now?"
            className="bare-input mt-3 block w-full resize-none bg-transparent text-[18px] leading-snug outline-none"
            style={{ color: "#f8ecc8", fontFamily: "Inter, system-ui, sans-serif", borderBottom: "1.5px solid #c9a24a", paddingBottom: 4, fieldSizing: "content" } as React.CSSProperties}
          />
          {error && (
            <p className="m-0 mt-2 text-[12.5px]" style={{ color: "#f2b8a8" }}>
              {error}
            </p>
          )}
          {/* Two equal pills (owner, Nov 21: layout 1, "This one"). */}
          <div className="mt-4 flex items-center gap-2.5">
            <button type="button" disabled={busy} onClick={() => finish(true)} className="font-display h-11 flex-1 rounded-full text-[16px] font-semibold disabled:opacity-60" style={{ border: "1.2px solid rgba(217,180,95,.7)", color: "#f3e7c6" }}>
              Keep it
            </button>
            <button type="button" disabled={busy} onClick={() => finish(false)} className="font-display h-11 flex-1 rounded-full text-[16px] font-semibold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", border: "1.2px solid #8a6116", color: "#2a1c10" }}>
              Continue
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

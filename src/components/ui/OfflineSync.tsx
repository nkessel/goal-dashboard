"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dismissOfflineFailures, flushOffline, setOfflineOwner, setOnline, useOfflineState } from "@/lib/offline";
import { Fold, useLinger } from "@/components/ui/Fold";

/** The main screens kept on the device in the background, so they open offline even if not visited yet. */
const WARM_PATHS = ["/", "/settings/inventory", "/boards", "/settings"];
const WARM_KEY = "sw-warm-at";
const WARM_EVERY = 6 * 3600_000;

function registerWorker() {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  // Automated browsers (the UI check) leave it off unless a flow turns it on to test it.
  let tested = false;
  try {
    tested = window.localStorage.getItem("ui-check-sw") === "1";
  } catch {}
  if (navigator.webdriver && !tested) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      let last = 0;
      try {
        last = Number(window.localStorage.getItem(WARM_KEY)) || 0;
      } catch {}
      if (navigator.onLine === false || (Date.now() - last < WARM_EVERY && !tested)) return;
      // Once the screen has settled, so it never competes with what you're opening.
      setTimeout(() => {
        reg.active?.postMessage({ type: "warm", paths: WARM_PATHS });
        try {
          window.localStorage.setItem(WARM_KEY, String(Date.now()));
        } catch {}
      }, tested ? 500 : 8000);
    })
    .catch(() => {});
}

/**
 * Keeps the app usable offline (owner, Nov 6): starts the offline helper (public/sw.js), sends
 * changes made offline once the connection is back (src/lib/offline.ts), and shows a small pill
 * while offline or syncing. Mounted by AppShell for the signed-in account.
 */
export function OfflineSync({ profileId }: { profileId: string }) {
  const router = useRouter();
  useEffect(() => {
    setOfflineOwner(profileId);
    setOnline(navigator.onLine !== false);
    const on = () => {
      setOnline(true);
      void flushOffline();
    };
    const off = () => setOnline(false);
    const synced = () => router.refresh();
    const seen = () => document.visibilityState === "visible" && void flushOffline();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("offline-synced", synced);
    document.addEventListener("visibilitychange", seen);
    void flushOffline();
    registerWorker();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("offline-synced", synced);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [profileId, router]);
  return <OfflinePill />;
}

const CloudOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 18h10.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 7.4 9.1 4.5 4.5 0 0 0 7 18Z" />
    <path d="M4 4l16 16" />
  </svg>
);
const SyncArrows = ({ spin }: { spin: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={spin ? { animation: "offline-spin 1.1s linear infinite" } : undefined}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20v-4h-4" />
  </svg>
);

/** A quiet parchment pill at the top: offline, syncing, synced, or a change that couldn't be saved. */
function OfflinePill() {
  const s = useOfflineState();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const waiting = s.ops.length;
  const justSynced = now - s.syncedAt < 2600;
  useEffect(() => {
    if (!s.syncedAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show "Synced" for a moment after it happens
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), 2700);
    return () => clearTimeout(t);
  }, [s.syncedAt]);

  const kind: "offline" | "syncing" | "waiting" | "failed" | "synced" | null = !s.online
    ? "offline"
    : s.failed.length
      ? "failed"
      : s.syncing
        ? "syncing"
        : waiting
          ? "waiting"
          : justSynced
            ? "synced"
            : null;
  // Stays a moment after it's done, to fade out (then leaves the page).
  const { shown: linger } = useLinger(!!kind, 300);
  const [last, setLast] = useState(kind);
  if (kind && kind !== last) setLast(kind);
  const shown = kind ?? last;
  if (!kind && open) setOpen(false);

  const changes = `${waiting} change${waiting === 1 ? "" : "s"}`;
  const label =
    shown === "offline"
      ? waiting
        ? `Offline · ${changes} kept here`
        : "Offline"
      : shown === "syncing"
        ? `Syncing ${changes}…`
        : shown === "waiting"
          ? `${changes} waiting to sync`
          : shown === "failed"
            ? `${s.failed.length} change${s.failed.length === 1 ? "" : "s"} couldn't save`
            : "✓ All synced";

  if (!kind && !linger) return null;
  return (
    <div
      data-offline-pill
      data-hide-when-typing
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[120] flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
    >
      <div
        className="fade-in flex max-w-[320px] flex-col items-center"
        style={{ opacity: kind ? 1 : 0, transform: kind ? "none" : "translateY(-8px)", transition: "opacity .25s ease, transform .25s ease", pointerEvents: kind ? "auto" : "none" }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-open={open ? "true" : "false"}
          className="qe-fact flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
          style={{ background: "rgba(251,243,223,.96)", boxShadow: "0 3px 10px rgba(0,0,0,.25)", color: shown === "failed" ? "#8a2a1a" : "#2a1c10" }}
        >
          {shown === "offline" ? <CloudOff /> : shown === "syncing" || shown === "waiting" ? <SyncArrows spin={shown === "syncing"} /> : null}
          <span>{label}</span>
        </button>
        <Fold open={open}>
          <div className="qe-fact-panel mt-1.5 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug" style={{ background: "rgba(251,243,223,.97)", color: "#2a1c10", boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
            {shown === "failed" ? (
              <>
                {s.failed.map((f, i) => (
                  <p key={i} className="m-0 mb-1">
                    <b>{f.what}:</b> {f.why}
                  </p>
                ))}
                <button type="button" onClick={() => (dismissOfflineFailures(), setOpen(false))} className="qe-fact mt-1 h-7 rounded-full px-3 text-[12.5px]">
                  OK
                </button>
              </>
            ) : (
              <p className="m-0">
                {shown === "offline"
                  ? "Keep going: your backpack, packing lists and quests save on this device and sync when you're back online."
                  : "Sending what you changed while offline."}
              </p>
            )}
          </div>
        </Fold>
      </div>
    </div>
  );
}

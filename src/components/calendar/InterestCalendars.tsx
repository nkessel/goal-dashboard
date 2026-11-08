"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findFeedAction, saveInterestCalendarsAction } from "@/app/actions";
import { cleanUrl, looksLikeFeed, INTEREST_COLORS, type InterestCalendar } from "@/lib/interest-calendars";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * Calendars of interest (owner, Nov 4), beside the Google calendars: ones with a feed the app reads
 * (shown in week and month views, a tick to show or hide each), and links to calendars it can't read
 * (websites), opened in a tap. Add one by its link; "Look for a feed" checks a website for one.
 */
export function InterestCalendars({ initial, isAdventure }: { initial: InterestCalendar[]; isAdventure: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [, start] = useTransition();
  const save = (next: InterestCalendar[]) => {
    setList(next);
    start(async () => {
      try {
        await saveInterestCalendarsAction(next);
        router.refresh();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  };
  const add = () => {
    const u = cleanUrl(url);
    if (!u) return setNote("That link doesn't look right.");
    const n = name.trim() || new URL(u).hostname.replace(/^www\./, "");
    const kind = looksLikeFeed(url) ? "feed" : "link";
    save([...list, { id: Math.random().toString(36).slice(2, 10), name: n.slice(0, 80), url: u, kind, on: true, color: INTEREST_COLORS[list.length % INTEREST_COLORS.length] }]);
    setName("");
    setUrl("");
    setNote(kind === "feed" ? `${n}: its events show in week and month views.` : `${n} is kept as a link. "Look for a feed" checks whether the app can read it.`);
  };
  const look = (c: InterestCalendar) => {
    setLooking(c.id);
    setNote(null);
    findFeedAction(c.url)
      .then((feed) => {
        if (!feed) return setNote(`No feed found for ${c.name}. It stays a link; paste its "subscribe" (.ics) link if you find one.`);
        save(list.map((x) => (x.id === c.id ? { ...x, kind: "feed", url: feed, on: true } : x)));
        setNote(`Found ${c.name}'s feed: its events show in week and month views.`);
      })
      .catch(() => setNote("Couldn't look just now."))
      .finally(() => setLooking(null));
  };
  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const feeds = list.filter((c) => c.kind === "feed");
  const links = list.filter((c) => c.kind === "link");
  const row = "flex min-h-9 items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-black/[.04]";
  const small = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.07]";
  return (
    <div className="flex flex-col gap-1">
      {feeds.length > 0 && (
        <span className="px-2 text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: soft }}>
          In week and month views
        </span>
      )}
      {feeds.map((c) => (
        <div key={c.id} className={row}>
          <button type="button" role="switch" aria-checked={c.on !== false} onClick={() => save(list.map((x) => (x.id === c.id ? { ...x, on: x.on === false } : x)))} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: c.on !== false ? (c.color ?? "#7a5fb0") : "transparent", border: `2px solid ${c.color ?? "#7a5fb0"}` }}>
              {c.on !== false && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate" style={{ color: ink }}>
              {c.name}
            </span>
          </button>
          <button type="button" onClick={() => save(list.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} title="Remove" className={small} style={{ color: soft }}>
            <CloseIcon size={10} />
          </button>
        </div>
      ))}
      {links.length > 0 && (
        <span className="mt-1 px-2 text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: soft }}>
          Links
        </span>
      )}
      {links.map((c) => (
        <div key={c.id} className={row}>
          <a href={c.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2" title={c.url} style={{ color: ink }}>
            <span aria-hidden>↗</span>
            <span className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{c.name}</span>
          </a>
          <button type="button" onClick={() => look(c)} disabled={looking === c.id} className="h-7 shrink-0 rounded-full px-2 text-[11.5px] font-semibold disabled:opacity-60" style={{ border: "1px solid #b39a6a", color: ink }} title="Check whether the app can read this calendar">
            {looking === c.id ? "Looking…" : "Look for a feed"}
          </button>
          <button type="button" onClick={() => save(list.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`} title="Remove" className={small} style={{ color: soft }}>
            <CloseIcon size={10} />
          </button>
        </div>
      ))}
      <form
        className="mt-1 flex flex-col gap-1 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Calendar name" className="h-8 rounded-lg border px-2 text-[16px] sm:text-[13.5px]" style={{ borderColor: "#b39a6a", background: isAdventure ? "rgba(255,250,238,.7)" : "var(--t-card)", color: ink }} />
        <span className="flex gap-1">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Calendar or website link" aria-label="Calendar link" inputMode="url" className="h-8 min-w-0 flex-1 rounded-lg border px-2 text-[16px] sm:text-[13.5px]" style={{ borderColor: "#b39a6a", background: isAdventure ? "rgba(255,250,238,.7)" : "var(--t-card)", color: ink }} />
          <button type="submit" disabled={!url.trim()} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold, #e2bb5c)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Add
          </button>
        </span>
      </form>
      {note && (
        <p className="m-0 px-2 text-[12px]" style={{ color: soft }}>
          {note}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { addQuestDropSongAction, pickQuestDropSongAction, removeQuestDropSongAction } from "@/app/quest-drop-actions";
import type { DropSong } from "@/lib/quest-drop";
import { cleanMusicLink } from "@/lib/quest-drop";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { GoldCheck } from "@/components/xp/WelcomeArrange";

export type Songs = { mine: DropSong[]; selected: string | null; everyone: DropSong[]; me: string };

/**
 * Quest Drop's "My music" (owner, Nov 19): your songs, saved to your account, the one that plays,
 * and a list everyone can add to ("Add this song for everyone").
 */
export function MusicPicker({ songs, onSongs }: { songs: Songs | null; onSongs: (s: Songs) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [showEveryone, setShowEveryone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const pill = "qe-fact flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[13px]";

  function run(p: Promise<Songs>) {
    setError(null);
    start(async () => {
      try {
        onSongs(await p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't save. Try again?");
      }
    });
  }

  function add() {
    if (!cleanMusicLink(url)) return setError("Paste the song's or playlist's web address (it starts with https://).");
    run(addQuestDropSongAction({ url, name }, shared));
    setUrl("");
    setName("");
    setShared(false);
  }

  if (!songs) return <span className="text-[12.5px]" style={{ color: soft }}>Loading your songs…</span>;
  const others = songs.everyone.filter((s) => !songs.mine.some((m) => m.url === s.url));

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5" data-quest-drop-music>
      {songs.mine.length > 0 && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="The song that plays">
          <button type="button" role="radio" aria-checked={!songs.selected} data-open={!songs.selected ? "true" : undefined} onClick={() => run(pickQuestDropSongAction(null))} className={`${pill} pr-3`}>
            None
          </button>
          {songs.mine.map((s) => (
            <span key={s.url} className={pill} data-open={songs.selected === s.url ? "true" : undefined}>
              <button type="button" role="radio" aria-checked={songs.selected === s.url} onClick={() => run(pickQuestDropSongAction(songs.selected === s.url ? null : s.url))} className="min-w-0 truncate" title={s.url}>
                {s.name}
              </button>
              <button type="button" aria-label={`Remove ${s.name}`} title="Remove from my songs" onClick={() => run(removeQuestDropSongAction(s.url, false))} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
                <CloseIcon size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Paste a song or playlist link"
          aria-label="A song or playlist link"
          className="bare-input h-8 w-full min-w-0 border-b bg-transparent text-[16px] outline-none sm:text-[13.5px]"
          style={{ borderColor: "rgba(139,112,64,.45)", color: ink }}
        />
        <Fold open={Boolean(url.trim())}>
          <div className="flex flex-col gap-1 pt-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Its name (optional)"
              aria-label="The song's name"
              maxLength={80}
              className="bare-input h-8 w-full min-w-0 border-b bg-transparent text-[16px] outline-none sm:text-[13.5px]"
              style={{ borderColor: "rgba(139,112,64,.45)", color: ink }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <GoldCheck checked={shared} onChange={setShared}>
                <span className="text-[13px]">Add this song for everyone</span>
              </GoldCheck>
              <button type="button" onClick={add} disabled={busy} className="h-8 rounded-full px-4 text-[13px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
                Add
              </button>
            </div>
          </div>
        </Fold>
      </div>
      {error && <span className="text-[12px]" style={{ color: "#a33" }}>{error}</span>}
      {others.length > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setShowEveryone((v) => !v)} aria-expanded={showEveryone} className="flex h-7 items-center gap-1 self-start text-[12.5px] font-semibold" style={{ color: soft }} data-quest-drop-everyone>
            Everyone&rsquo;s songs ({others.length})
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: showEveryone ? "rotate(180deg)" : undefined }}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Fold open={showEveryone}>
            <div className="flex flex-wrap gap-1 pb-1">
              {others.map((s) => (
                <span key={s.url} className={pill}>
                  <button type="button" onClick={() => run(pickQuestDropSongAction(s.url))} className="min-w-0 truncate" title={s.byName ? `Added by ${s.byName}. Tap to play it.` : "Tap to play it"}>
                    {s.name}
                  </button>
                  {s.by === songs.me ? (
                    <button type="button" aria-label={`Take ${s.name} off everyone's list`} title="Take it off everyone's list" onClick={() => run(removeQuestDropSongAction(s.url, true))} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
                      <CloseIcon size={10} />
                    </button>
                  ) : (
                    <span className="w-2" />
                  )}
                </span>
              ))}
            </div>
          </Fold>
        </div>
      )}
      <span className="text-[12px]" style={{ color: soft }}>
        {songs.selected ? "Opens in your music app when a game starts; the game's tune stays quiet." : "Spotify, YouTube, Apple Music… the one you pick opens when a game starts."}
      </span>
    </div>
  );
}

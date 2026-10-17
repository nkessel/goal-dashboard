"use client";

import { LevelPill } from "./LevelPill";
import Link from "next/link";
import { shownLevel } from "@/lib/shown-level";
import { useState, useTransition } from "react";
import { sendFriendRequestAction, removeFriendAction } from "@/app/actions";
import type { Friendship, Profile } from "@/lib/data/types";
import { defaultPortraitFor } from "@/components/settings/Avatar";

type Row = { profile: Profile; friendship?: Friendship };
type Theme = "calm" | "adventure";

export function FriendDirectory({
  profileId,
  rows,
  theme = "calm",
  championId = null,
}: {
  profileId: string;
  rows: Row[];
  championId?: string | null;
  theme?: Theme;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Search by name, or by someone's exact email address (emails are never listed).
  const shown = q
    ? rows.filter((r) => (r.profile.name ?? "").toLowerCase().includes(q) || (q.includes("@") && (r.profile.email ?? "").toLowerCase() === q))
    : rows;
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email"
        aria-label="Find someone"
        className="h-10 rounded-full border px-4 text-[16px]"
        style={{ borderColor: theme === "adventure" ? "var(--t-panel-border)" : "var(--t-card-border)", background: theme === "adventure" ? "rgba(255,250,238,.7)" : "var(--t-bg)", color: "var(--t-ink)" }}
      />
      <ul className="flex flex-col" style={{ color: "var(--t-ink)" }}>
        {shown.map((row, i) => (
          <DirectoryRow championId={championId} key={row.profile.id} profileId={profileId} row={row} theme={theme} showDivider={i > 0} />
        ))}
        {shown.length === 0 && (
          <p className="py-2 text-sm" style={{ color: "var(--t-ink-soft)" }}>
            {q ? "No one by that name yet. Send them your invite link instead." : "No one else here yet. Share your invite link."}
          </p>
        )}
      </ul>
    </div>
  );
}

function DirectoryRow({
  profileId,
  row,
  theme,
  showDivider,
  championId,
}: {
  championId: string | null;
  profileId: string;
  row: Row;
  theme: Theme;
  showDivider: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { profile, friendship } = row;
  const isAdventure = theme === "adventure";

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        await sendFriendRequestAction(profile.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function remove() {
    if (!friendship) return;
    startTransition(async () => {
      await removeFriendAction(friendship.id);
    });
  }

  return (
    <li
      className="flex items-center justify-between gap-2 py-2.5 text-sm"
      style={
        showDivider
          ? { borderTop: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }
          : undefined
      }
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- portrait */}
        <img src={profile.avatar_image_url ?? defaultPortraitFor(profile.id)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ border: "1.5px solid #a58c66" }} />
        {friendship?.status === "accepted" ? (
          <Link href={`/friends/${profile.id}`} className="truncate text-[15px] font-semibold underline-offset-2 hover:underline" title={`See ${profile.name || "their"} profile`}>
            {profile.name || "Adventurer"}
          </Link>
        ) : (
          <span className="truncate text-[15px] font-semibold">{profile.name || "Adventurer"}</span>
        )}
        <LevelPill level={shownLevel(profile)} champion={profile.id === championId} />
      </div>

      {!friendship && (
        <button
          type="button"
          onClick={send}
          disabled={isPending}
          className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
          style={{ border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
        >
          + Invite to party
        </button>
      )}
      {friendship?.status === "pending" && friendship.requester_id === profileId && (
        <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Invite sent
        </span>
      )}
      {friendship?.status === "pending" && friendship.addressee_id === profileId && (
        <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Respond above ↑
        </span>
      )}
      {friendship?.status === "accepted" && (
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-full px-3 py-1 text-xs disabled:opacity-50"
          style={{
            border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
            color: "var(--t-ink-soft)",
          }}
        >
          ✓ In your party · remove
        </button>
      )}
      {friendship?.status === "declined" && (
        <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Declined
        </span>
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </li>
  );
}

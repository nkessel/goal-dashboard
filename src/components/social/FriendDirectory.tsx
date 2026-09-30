"use client";

import { useState, useTransition } from "react";
import { sendFriendRequestAction, removeFriendAction } from "@/app/actions";
import type { Friendship, Profile } from "@/lib/data/types";

type Row = { profile: Profile; friendship?: Friendship };
type Theme = "calm" | "adventure";

export function FriendDirectory({
  profileId,
  rows,
  theme = "calm",
}: {
  profileId: string;
  rows: Row[];
  theme?: Theme;
}) {
  return (
    <ul className="flex flex-col" style={{ color: "var(--t-ink)" }}>
      {rows.map((row, i) => (
        <DirectoryRow key={row.profile.id} profileId={profileId} row={row} theme={theme} showDivider={i > 0} />
      ))}
      {rows.length === 0 && (
        <p className="py-2 text-sm" style={{ color: "var(--t-ink-soft)" }}>
          No other users yet — share your invite link below.
        </p>
      )}
    </ul>
  );
}

function DirectoryRow({
  profileId,
  row,
  theme,
  showDivider,
}: {
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
      <div className="flex items-center gap-2">
        <span className="font-medium">{profile.name || profile.email}</span>
        {profile.level >= 8 && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "var(--t-accent-soft)", color: "var(--t-gold-deep)" }}
          >
            Lv{profile.level}
          </span>
        )}
      </div>

      {!friendship && (
        <button
          type="button"
          onClick={send}
          disabled={isPending}
          className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
          style={{ border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
        >
          + Add friend
        </button>
      )}
      {friendship?.status === "pending" && friendship.requester_id === profileId && (
        <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Request sent
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
          ✓ Friends — remove
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

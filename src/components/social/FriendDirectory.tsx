"use client";

import { useState, useTransition } from "react";
import { sendFriendRequestAction, removeFriendAction } from "@/app/actions";
import type { Friendship, Profile } from "@/lib/data/types";

type Row = { profile: Profile; friendship?: Friendship };

export function FriendDirectory({ profileId, rows }: { profileId: string; rows: Row[] }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {rows.map((row) => (
        <DirectoryRow key={row.profile.id} profileId={profileId} row={row} />
      ))}
      {rows.length === 0 && <p className="py-2 text-sm text-zinc-400">No other users yet — share your invite link below.</p>}
    </ul>
  );
}

function DirectoryRow({ profileId, row }: { profileId: string; row: Row }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { profile, friendship } = row;

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
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">
          {profile.name || profile.email}
        </span>
        {profile.level >= 8 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Lv{profile.level} Adventurer
          </span>
        )}
      </div>

      {!friendship && (
        <button
          type="button"
          onClick={send}
          disabled={isPending}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + Add friend
        </button>
      )}
      {friendship?.status === "pending" && friendship.requester_id === profileId && (
        <span className="text-xs text-zinc-400">Request sent</span>
      )}
      {friendship?.status === "pending" && friendship.addressee_id === profileId && (
        <span className="text-xs text-zinc-400">Respond above ↑</span>
      )}
      {friendship?.status === "accepted" && (
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          ✓ Friends — remove
        </button>
      )}
      {friendship?.status === "declined" && <span className="text-xs text-zinc-400">Declined</span>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}

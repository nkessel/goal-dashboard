"use client";

import { useTransition } from "react";
import { respondFriendRequestAction } from "@/app/actions";
import type { Friendship, Profile } from "@/lib/data/types";

export function FriendRequests({
  incoming,
}: {
  incoming: { friendship: Friendship; profile: Profile }[];
}) {
  const [isPending, startTransition] = useTransition();

  if (incoming.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950">
      <h3 className="font-semibold text-indigo-900 dark:text-indigo-200">
        Friend requests ({incoming.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {incoming.map(({ friendship, profile }) => (
          <li key={friendship.id} className="flex items-center justify-between gap-2">
            <span>{profile.name || profile.email}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => respondFriendRequestAction(friendship.id, true))}
                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => respondFriendRequestAction(friendship.id, false))}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-white disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

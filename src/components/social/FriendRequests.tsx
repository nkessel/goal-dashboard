"use client";

import { useTransition } from "react";
import { respondFriendRequestAction } from "@/app/actions";
import type { Friendship, Profile } from "@/lib/data/types";

export function FriendRequests({
  incoming,
  theme = "calm",
}: {
  incoming: { friendship: Friendship; profile: Profile }[];
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  if (incoming.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl p-3.5 text-sm"
      style={{
        background: isAdventure ? "rgba(209,161,60,.12)" : "var(--t-accent-soft)",
        border: `1px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}`,
        color: "var(--t-ink)",
      }}
    >
      <h3 className="font-semibold">
        {isAdventure ? "Adventurers seeking your party" : "Friend requests"} ({incoming.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {incoming.map(({ friendship, profile }) => (
          <li key={friendship.id} className="flex items-center justify-between gap-2">
            <span>{profile.name || profile.email}</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => respondFriendRequestAction(friendship.id, true))}
                className="rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
                style={{ background: "var(--t-good)", color: "#fff" }}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => respondFriendRequestAction(friendship.id, false))}
                className="rounded-full px-3 py-1 text-xs disabled:opacity-50"
                style={{ border: "1px solid var(--t-ink-soft)", color: "var(--t-ink-soft)" }}
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

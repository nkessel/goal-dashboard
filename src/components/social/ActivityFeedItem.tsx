import type { FeedItem } from "@/lib/data/activity";
import type { Profile } from "@/lib/data/types";
import { Avatar } from "@/components/settings/Avatar";
import { shownLevel } from "@/lib/shown-level";
import { formatRelativeTime } from "@/lib/format-time";
import { ReactionBar } from "./ReactionBar";
import { CommentThread, type CommentWithAuthor } from "./CommentThread";
import { PartyShow } from "./PartyView";

function describe(item: FeedItem, authorName: string): string {
  if (item.kind === "task_completed") return `${authorName} completed "${item.task_title ?? "a task"}"`;
  if (item.kind === "goal_completed") return `${authorName} completed the goal "${item.goal_title ?? ""}"`;
  return `${authorName} leveled up!`;
}

export function ActivityFeedItem({
  item,
  author,
  profiles,
  viewerId,
  theme = "calm",
}: {
  item: FeedItem;
  author: Profile | undefined;
  profiles: Map<string, Profile>;
  viewerId: string;
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const authorName = author?.name || author?.email || "Someone";
  const comments: CommentWithAuthor[] = item.comments.map((c) => {
    const p = profiles.get(c.profile_id);
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      authorName: p?.name || p?.email || "Someone",
      authorLevel: p?.level ?? 1,
      authorId: p ? c.profile_id : null,
    };
  });

  return (
    <li
      id={`activity-${item.id}`}
      className={`flex scroll-mt-24 flex-col gap-3 rounded-2xl px-4 py-4 target:ring-2 target:ring-[#d9b45f] ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <div className="flex items-center gap-2.5">
        {author ? (
          <a href={`/friends/${author.id}`} title={`See ${authorName}'s screens`} className="shrink-0 rounded-full">
            <Avatar profile={author} size={12} />
          </a>
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: "var(--t-ink-soft)" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold leading-tight" style={{ color: "var(--t-ink)" }}>
            {author ? (
              <a href={`/friends/${author.id}`} className="underline-offset-2 hover:underline" title={`See ${authorName}'s screens`}>
                {authorName}
              </a>
            ) : (
              authorName
            )}{" "}
            {author && (
              <span className="ml-1 rounded-full px-2 py-px align-middle text-[12px] font-semibold" style={{ background: "rgba(42,28,16,.82)", color: "#f2d27e" }}>
                Lvl {shownLevel(author)}
              </span>
            )}
          </div>
          <div className="text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
            {formatRelativeTime(item.created_at)}
          </div>
        </div>
      </div>

      <p className="m-0 text-[16.5px] leading-snug" style={{ color: "var(--t-ink)" }}>
        {describe(item, authorName)}
        {item.kind === "task_completed" && (item.task_xp ?? 0) > 0 && (
          <PartyShow k="xp">
            {" "}
            <span className="ml-1 whitespace-nowrap rounded-full px-2 py-px align-middle text-[13px] font-bold tabular-nums" style={{ background: "rgba(42,28,16,.82)", color: "#f2d27e" }}>
              +{item.task_xp} XP
            </span>
          </PartyShow>
        )}
      </p>

      <div className="flex items-center gap-2.5">
        <ReactionBar activityId={item.id} reactions={item.reactions} profileId={viewerId} theme={theme} />
      </div>
      <CommentThread activityId={item.id} comments={comments} theme={theme} />
    </li>
  );
}

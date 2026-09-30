import type { FeedItem } from "@/lib/data/activity";
import type { Profile } from "@/lib/data/types";
import { Avatar } from "@/components/settings/Avatar";
import { formatRelativeTime } from "@/lib/format-time";
import { ReactionBar } from "./ReactionBar";
import { CommentThread, type CommentWithAuthor } from "./CommentThread";

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
    };
  });

  return (
    <li
      className="flex flex-col gap-2.5 rounded-2xl p-3.5"
      style={{
        background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
        border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        borderWidth: isAdventure ? 2 : 1,
      }}
    >
      <div className="flex items-center gap-2.5">
        {author ? (
          <Avatar profile={author} size={12} />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: "var(--t-ink-soft)" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
            {authorName}{" "}
            {author && (
              <span className="text-xs font-bold" style={{ color: "var(--t-gold-deep)" }}>
                Lvl {author.level}
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {formatRelativeTime(item.created_at)}
          </div>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--t-ink)" }}>
        {describe(item, authorName)}
      </p>

      <div className="flex items-center gap-2.5">
        <ReactionBar activityId={item.id} reactions={item.reactions} profileId={viewerId} theme={theme} />
      </div>
      <CommentThread activityId={item.id} comments={comments} theme={theme} />
    </li>
  );
}

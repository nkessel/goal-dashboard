import type { FeedItem } from "@/lib/data/activity";
import type { Profile } from "@/lib/data/types";
import { ReactionBar } from "./ReactionBar";
import { CommentThread, type CommentWithAuthor } from "./CommentThread";

function describe(item: FeedItem, authorName: string): string {
  if (item.kind === "task_completed") return `${authorName} completed "${item.task_title ?? "a task"}" ✅`;
  if (item.kind === "goal_completed") return `${authorName} completed the goal "${item.goal_title ?? ""}" 🎯`;
  return `${authorName} leveled up! 🎉`;
}

export function ActivityFeedItem({
  item,
  author,
  profiles,
  viewerId,
}: {
  item: FeedItem;
  author: Profile | undefined;
  profiles: Map<string, Profile>;
  viewerId: string;
}) {
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
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-zinc-800 dark:text-zinc-200">
          {describe(item, authorName)}
          {author && author.level >= 8 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Lv{author.level} Adventurer
            </span>
          )}
        </span>
        <time className="shrink-0 text-xs text-zinc-400">
          {new Date(item.created_at).toLocaleString()}
        </time>
      </div>

      <ReactionBar activityId={item.id} reactions={item.reactions} profileId={viewerId} />
      <CommentThread activityId={item.id} comments={comments} />
    </li>
  );
}

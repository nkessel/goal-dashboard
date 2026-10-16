import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById, getProfilesByIds } from "@/lib/data/profiles";
import { getThread } from "@/lib/data/forum";
import { isAdmin } from "@/lib/data/feedback";
import { ThreadPage } from "@/components/social/ThreadPage";
import type { AuthorView } from "@/components/social/Forums";

export default async function ForumThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const session = await requireSession();
  const { threadId } = await params;
  const [found, profile, admin] = await Promise.all([getThread(threadId, session.user.id), getProfileById(session.user.id), isAdmin(session.user.id)]);
  if (!found) notFound();
  const theme = profile?.theme ?? "adventure";
  const ids = [found.thread.author_id, ...found.posts.map((p) => p.author_id)].filter((x): x is string => !!x);
  const people = await getProfilesByIds([...new Set(ids)]);
  const authors: Record<string, AuthorView> = Object.fromEntries(
    [...people.values()].map((p) => [p.id, { id: p.id, name: p.name?.split(" ")[0] ?? "Adventurer", level: p.level, avatar_color: p.avatar_color, avatar_image_url: p.avatar_image_url }])
  );

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-3">
        <Link href="/feed" className="self-start text-[14px] underline underline-offset-2" style={{ color: theme === "adventure" ? "var(--t-gold)" : "var(--t-accent)" }}>
          ← Guild Hall
        </Link>
        <ThreadPage thread={found.thread} posts={found.posts} voted={found.voted} authors={authors} viewerId={session.user.id} admin={admin} theme={theme} />
      </div>
    </AppShell>
  );
}

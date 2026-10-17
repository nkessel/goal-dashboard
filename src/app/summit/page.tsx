import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { AdventureView, type WorldKey } from "@/components/summit/AdventureView";
import { listCompletedTasksForOwner, listOpenTasksForOwnerWithCategory } from "@/lib/data/tasks";
import { getProfileById } from "@/lib/data/profiles";
import { getActiveBoss } from "@/lib/data/bosses";
import { xpToNextLevel } from "@/lib/levels";

/** The secret mountain view of today: reached from the level boss. */
export default async function SummitPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const session = await requireSession();
  const { w } = await searchParams;
  const world: WorldKey = w === "voyage" || w === "stars" || w === "crossing" ? w : "summit";
  const [open, done, profile, boss] = await Promise.all([
    listOpenTasksForOwnerWithCategory(session.user.id),
    listCompletedTasksForOwner(session.user.id, 40),
    getProfileById(session.user.id),
    getActiveBoss(session.user.id).catch(() => null),
  ]);
  const today = open.filter((t) => !t.needs_review && t.is_manual_priority);
  const since = Date.now() - 20 * 3_600_000;
  const doneToday = done
    .filter((t) => t.completed_at && new Date(t.completed_at).getTime() > since)
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const art = (t: { icon_key?: string | null; icon_source?: string | null }) => ((t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null);
  const quests = [
    ...doneToday.map((t) => ({ id: t.id, title: t.title, xp: t.xp_value, icon: art(t), done: true })),
    ...today.map((t) => ({ id: t.id, title: t.title, xp: t.xp_value, icon: art(t), done: false })),
  ];
  const cards = Object.fromEntries([...doneToday.map((t) => [t.id, { ...t, categoryLabel: null }]), ...today.map((t) => [t.id, t])]);
  const { level } = xpToNextLevel(profile?.total_xp ?? 0, boss?.level ?? 10);
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <AdventureView
        world={world}
        quests={quests}
        cards={cards}
        level={level}
        boss={boss ? { title: boss.title, level: boss.level, target: boss.target, progress: boss.progress } : null}
      />
    </AppShell>
  );
}

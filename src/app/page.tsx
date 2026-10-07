import { auth, signIn } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { TodayTaskBoard } from "@/components/tasks/TodayTaskBoard";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { XpSummary } from "@/components/xp/XpSummary";
import {
  listOpenTasksForOwnerWithCategory,
  listCompletedTasksForOwner,
  countCompletedTasksForOwner,
} from "@/lib/data/tasks";
import { getProfileById } from "@/lib/data/profiles";
import { getWeeklyXpEarned, currentWeekStart } from "@/lib/data/xp";
import { listFriendIds } from "@/lib/data/friendships";
import { listClaimedSince } from "@/lib/data/rewards";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div
        data-theme="adventure"
        className="flex min-h-screen flex-col items-center justify-center gap-8 p-8"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-display text-3xl" style={{ color: "var(--t-cream)" }}>
            Goal Dashboard
          </h1>
          <p className="max-w-xs text-sm" style={{ color: "var(--t-cream)", opacity: 0.75 }}>
            Turn your to-do list into a daily quest log — track tasks, earn XP, and share progress
            with friends.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="font-display rounded-full px-6 py-3 text-sm font-bold"
            style={{ background: "var(--t-gold)", color: "#3b2a10" }}
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  const [openTasks, completedTasks, profile, questsComplete, xpThisWeek, friendIds] = await Promise.all([
    listOpenTasksForOwnerWithCategory(session.user.id),
    listCompletedTasksForOwner(session.user.id),
    getProfileById(session.user.id),
    countCompletedTasksForOwner(session.user.id),
    getWeeklyXpEarned(session.user.id, currentWeekStart()),
    listFriendIds(session.user.id),
  ]);
  const claimedToday = await listClaimedSince(session.user.id, new Date().toISOString().slice(0, 10) + "T00:00:00Z").catch(() => []);
  const topPriorities = openTasks.filter((t) => t.is_manual_priority);
  const otherTasks = openTasks.filter((t) => !t.is_manual_priority);
  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";

  const victoriesStyle = {
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
  };

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-6">
        {profile && (
          <section>
            <XpSummary
              profile={profile}
              stats={{ questsComplete, xpThisWeek, partySize: friendIds.length }}
            />
          </section>
        )}

        <TodayTaskBoard priorityTasks={topPriorities} otherTasks={otherTasks} theme={theme} />

        <section>
          <AddTaskForm theme={theme} />
        </section>

        <section className="flex flex-col gap-2.5 rounded-2xl px-4 py-3.5" style={victoriesStyle}>
          <div className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
            {isAdventure && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l2 5 5 .5-4 3.6 1.1 5.4L12 13.9 7.9 16.5 9 11.1 5 7.5 10 7z"
                  fill="var(--t-gold-deep)"
                />
              </svg>
            )}
            {isAdventure ? "Victories Today" : "Completed today"}
          </div>
          <ul className="flex flex-col gap-1">
            {profile?.last_check_in_at?.slice(0, 10) === new Date().toISOString().slice(0, 10) && (
              <li className="flex items-center justify-between gap-2 py-1 text-sm" style={{ color: "var(--t-ink)" }}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>✨</span>
                  {isAdventure ? "Answered the call (daily login)" : "Daily login"}
                </span>
                <span className="font-semibold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                  +5 XP
                </span>
              </li>
            )}
            {claimedToday.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1 text-sm" style={{ color: "var(--t-ink)" }}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>🎁</span>
                  {isAdventure ? "Treasure claimed: " : "Reward: "}
                  {r.title}
                </span>
              </li>
            ))}
            {completedTasks.map((task) => (
              <CompletedTaskRow key={task.id} task={task} theme={theme} />
            ))}
            {completedTasks.length === 0 && profile?.last_check_in_at?.slice(0, 10) !== new Date().toISOString().slice(0, 10) && (
              <p className="py-1 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Nothing completed yet today — you&apos;ve got this.
              </p>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

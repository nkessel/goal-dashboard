import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuestsTabs } from "@/components/layout/QuestsTabs";
import { PriorityViews } from "@/components/matrix/PriorityViews";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { listBoardsForOwner } from "@/lib/data/boards";
import { getProfileById } from "@/lib/data/profiles";
import { attachNextSteps } from "@/lib/data/steps";
import { listEnergySince } from "@/lib/data/energy";
import { xpToNextLevel } from "@/lib/data/xp";
import { levelCap } from "@/lib/data/bosses";
import {
  listCompletedTasksForOwner,
  listOpenTasksWithBoardForOwner,
} from "@/lib/data/tasks";

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const plotIds = typeof sp.plot === "string" ? sp.plot.split(",").filter(Boolean) : undefined;
  const confirmImports = sp.review === "1";

  // One wave: the steps join the open quests as soon as those arrive, alongside the rest.
  const [boards, tasks, completedTasks, profile, energy, cap] = await Promise.all([
    listBoardsForOwner(session.user.id),
    // Steps (counts and the next one to do) feed the Finish line and Start-friction views.
    listOpenTasksWithBoardForOwner(session.user.id).then((raw) => attachNextSteps(raw, session.user.id).catch(() => raw)),
    listCompletedTasksForOwner(session.user.id, 10),
    getProfileById(session.user.id),
    listEnergySince(session.user.id, new Date(Date.now() - 30 * 86_400_000).toISOString()),
    levelCap(session.user.id).catch(() => 10),
  ]);

  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp, cap).level : 1;
  const victoriesStyle = {
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
  };

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <PageHeader isAdventure={isAdventure} title="All Quests" calmTitle="All quests" subtitle="Weigh every quest — by the classic matrix, or by everything at once" />
        </div>
        <QuestsTabs active="priority" isAdventure={isAdventure} />


        <PriorityViews tasks={tasks} theme={theme} boards={boards} plotIds={plotIds} confirmImports={confirmImports} energy={energy.map((e) => ({ level: e.level, at: e.created_at }))} />

        <section
          className={`flex flex-col gap-1.5 rounded-2xl px-5 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
          style={isAdventure ? undefined : victoriesStyle}
        >
          <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[20px]" : "text-sm font-semibold"}`} style={{ color: "var(--t-ink)" }}>
            Completed
          </h2>
          <ul className="relative z-[1] flex flex-col">
            {completedTasks.map((task) => (
              <CompletedTaskRow key={task.id} task={task} theme={theme} />
            ))}
            {completedTasks.length === 0 && (
              <p className="py-1 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Nothing completed yet.
              </p>
            )}
          </ul>
        </section>
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
    </AppShell>
  );
}

// The browser tab names the screen you are on (owner, Nov 5).
export const metadata = { title: "Matrix" };

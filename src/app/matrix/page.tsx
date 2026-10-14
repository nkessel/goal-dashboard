import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { PriorityMatrix } from "@/components/matrix/PriorityMatrix";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { listBoardsForOwner } from "@/lib/data/boards";
import { getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";
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

  const [boards, tasks, completedTasks, profile] = await Promise.all([
    listBoardsForOwner(session.user.id),
    listOpenTasksWithBoardForOwner(session.user.id),
    listCompletedTasksForOwner(session.user.id, 10),
    getProfileById(session.user.id),
  ]);

  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp).level : 1;
  const victoriesStyle = {
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
  };

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <PageHeader isAdventure={isAdventure} title="Quest Priority Matrix" calmTitle="Priority Matrix" subtitle={isAdventure ? "Plot every quest by importance and urgency" : "See everything by importance and urgency"} />
        </div>


        <PriorityMatrix tasks={tasks} theme={theme} boards={boards}
          plotIds={plotIds}
          confirmImports={confirmImports}
        />

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

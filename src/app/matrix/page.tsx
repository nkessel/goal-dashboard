import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
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
  searchParams: Promise<{ board?: string }>;
}) {
  const session = await requireSession();
  const { board: boardFilter } = await searchParams;

  const [boards, tasks, completedTasks, profile] = await Promise.all([
    listBoardsForOwner(session.user.id),
    listOpenTasksWithBoardForOwner(session.user.id),
    listCompletedTasksForOwner(session.user.id, 10),
    getProfileById(session.user.id),
  ]);

  const filteredTasks = boardFilter ? tasks.filter((t) => t.board_id === boardFilter) : tasks;
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
          <div className="flex items-center justify-between">
            <h1
              className={isAdventure ? "font-display text-xl" : "text-lg font-extrabold"}
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              {isAdventure ? "War Map" : "Priority Matrix"}
            </h1>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold"
              style={
                isAdventure
                  ? {
                      background: "radial-gradient(circle at 35% 30%, #5f7a52, #24361f)",
                      border: "2px solid var(--t-gold)",
                      color: "var(--t-gold)",
                      fontFamily: "var(--font-display)",
                    }
                  : { background: "var(--t-accent-soft)", color: "var(--t-accent)" }
              }
            >
              {isAdventure ? `L${level}` : `LV ${level}`}
            </div>
          </div>
          <p
            className="text-sm"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.7 : 1 }}
          >
            {isAdventure ? "Plot every quest by importance and urgency" : "See everything by importance and urgency"}
          </p>
        </div>

        <form method="GET" className="flex items-center gap-2 text-sm">
          <select
            name="board"
            defaultValue={boardFilter ?? ""}
            className="flex-1 rounded-lg border px-2 py-1.5"
            style={{
              borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              color: "var(--t-ink)",
            }}
          >
            <option value="">All boards</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
            }}
          >
            Filter
          </button>
        </form>

        <PriorityMatrix tasks={filteredTasks} theme={theme} />

        <section className="flex flex-col gap-2.5 rounded-2xl px-4 py-3.5" style={victoriesStyle}>
          <div className="text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
            Completed
          </div>
          <ul className="flex flex-col">
            {completedTasks.map((task) => (
              <CompletedTaskRow key={task.id} task={task} />
            ))}
            {completedTasks.length === 0 && (
              <p className="py-1 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Nothing completed yet.
              </p>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PriorityMatrix } from "@/components/matrix/PriorityMatrix";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { listBoardsForOwner } from "@/lib/data/boards";
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

  const [boards, tasks, completedTasks] = await Promise.all([
    listBoardsForOwner(session.user.id),
    listOpenTasksWithBoardForOwner(session.user.id),
    listCompletedTasksForOwner(session.user.id, 10),
  ]);

  const filteredTasks = boardFilter
    ? tasks.filter((t) => t.board_id === boardFilter)
    : tasks;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Priority Matrix
          </h1>
          <form method="GET" className="flex items-center gap-2 text-sm">
            <select
              name="board"
              defaultValue={boardFilter ?? ""}
              className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
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
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Filter
            </button>
          </form>
        </div>

        <PriorityMatrix tasks={filteredTasks} />

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">
            Completed
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {completedTasks.map((task) => (
              <CompletedTaskRow key={task.id} task={task} />
            ))}
            {completedTasks.length === 0 && (
              <p className="py-2 text-sm text-zinc-400">Nothing completed yet.</p>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

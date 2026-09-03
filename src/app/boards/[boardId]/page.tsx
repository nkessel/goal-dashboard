import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getBoard } from "@/lib/data/boards";
import { listGoalsForBoard } from "@/lib/data/goals";
import { listTasksForGoal } from "@/lib/data/tasks";
import { CreateGoalForm } from "@/components/goals/CreateGoalForm";
import { GoalProgressControl } from "@/components/goals/GoalProgressControl";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { TaskRow } from "@/components/tasks/TaskRow";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const session = await requireSession();

  const board = await getBoard(boardId, session.user.id);
  if (!board) notFound();

  const goals = await listGoalsForBoard(boardId);
  const goalsWithTasks = await Promise.all(
    goals.map(async (goal) => ({
      goal,
      tasks: await listTasksForGoal(goal.id),
    }))
  );

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {board.title}
            {board.is_private && (
              <span className="ml-2 text-xs text-zinc-400">🔒 private</span>
            )}
          </h1>
          {board.description && (
            <p className="text-sm text-zinc-500">{board.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {goalsWithTasks.map(({ goal, tasks }) => (
            <div
              key={goal.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {goal.title}
                  {goal.is_private && (
                    <span className="ml-2 text-xs text-zinc-400">
                      🔒 private
                    </span>
                  )}
                </p>
                {goal.description && (
                  <p className="text-sm text-zinc-500">{goal.description}</p>
                )}
              </div>

              <GoalProgressControl
                goalId={goal.id}
                boardId={board.id}
                initialProgress={goal.progress}
              />

              {tasks.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </ul>
              )}

              <AddTaskForm goalId={goal.id} />
            </div>
          ))}
        </div>

        <CreateGoalForm boardId={board.id} />
      </div>
    </AppShell>
  );
}

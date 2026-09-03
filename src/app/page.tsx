import { auth, signIn } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { listOpenTasksForOwner, listCompletedTasksForOwner } from "@/lib/data/tasks";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 font-sans dark:bg-black">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Goal Dashboard
        </h1>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  const [openTasks, completedTasks] = await Promise.all([
    listOpenTasksForOwner(session.user.id),
    listCompletedTasksForOwner(session.user.id),
  ]);

  const topPriorities = openTasks.filter((t) => t.is_manual_priority);
  const otherTasks = openTasks.filter((t) => !t.is_manual_priority);

  return (
    <AppShell userLabel={session.user.email ?? ""}>
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Today&apos;s Priorities
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({topPriorities.length}/3)
            </span>
          </h2>
          {topPriorities.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
              Nothing pinned yet — pin up to 3 tasks below to curate today&apos;s
              focus.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topPriorities.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <AddTaskForm />
        </section>

        <section>
          <details className="group" open={otherTasks.length > 0 && topPriorities.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              All other tasks ({otherTasks.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {otherTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              {otherTasks.length === 0 && (
                <p className="text-sm text-zinc-500">Nothing here — nice.</p>
              )}
            </ul>
          </details>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">
            Completed
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {completedTasks.map((task) => (
              <CompletedTaskRow key={task.id} task={task} />
            ))}
            {completedTasks.length === 0 && (
              <p className="py-2 text-sm text-zinc-400">
                Nothing completed yet today — you&apos;ve got this.
              </p>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

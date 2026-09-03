import Link from "next/link";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";
import { listBoardsForOwner } from "@/lib/data/boards";

export default async function BoardsPage() {
  const session = await requireSession();
  const boards = await listBoardsForOwner(session.user.id);

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Boards
          </h1>
          <CreateBoardForm />
        </div>

        {boards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
            No boards yet. Create one to start grouping goals — e.g.
            &quot;Dreaming&quot;, &quot;Startup&quot;, &quot;Daily Tasks&quot;.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/boards/${board.id}`}
                  className="block rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  style={{ backgroundColor: board.color ?? undefined }}
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {board.title}
                    {board.is_private && (
                      <span className="ml-2 text-xs text-zinc-400">
                        🔒 private
                      </span>
                    )}
                  </p>
                  {board.description && (
                    <p className="mt-1 truncate text-sm text-zinc-500">
                      {board.description}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

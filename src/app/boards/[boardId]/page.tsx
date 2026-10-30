import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById } from "@/lib/data/profiles";
import { BoardFabMenu } from "@/components/boards/BoardFabMenu";
import { BoardBody, loadBoard } from "@/components/boards/BoardBody";
import { BoardTrail } from "@/components/boards/BoardTrail";
import { UNCATEGORIZED_ID } from "@/lib/board-ids";

export default async function BoardDetailPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const session = await requireSession();
  const [data, profile] = await Promise.all([loadBoard(boardId, session.user.id), getProfileById(session.user.id)]);
  const theme = profile?.theme ?? "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <BoardTrail ancestors={data.head.ancestors} current={data.head.title} isAdventure={theme === "adventure"} />
        <BoardBody data={data} theme={theme} arrange />
        {boardId !== UNCATEGORIZED_ID && <BoardFabMenu boardId={boardId} theme={theme} />}
      </div>
    </AppShell>
  );
}

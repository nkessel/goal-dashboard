import { requireSession } from "@/lib/session";
import { getProfileById } from "@/lib/data/profiles";
import { BoardBody, loadBoard } from "@/components/boards/BoardBody";
import { BoardTrail } from "@/components/boards/BoardTrail";
import { BoardPeek } from "@/components/boards/BoardPeek";
import { UNCATEGORIZED_ID } from "@/lib/board-ids";

/** A board opened from within the app: a large popup over the current screen that can be maximized. */
export default async function BoardPeekRoute({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const session = await requireSession();
  const [data, profile] = await Promise.all([loadBoard(boardId, session.user.id), getProfileById(session.user.id)]);
  const theme = profile?.theme === "adventure" ? "adventure" : "calm";
  return (
    <BoardPeek
      theme={theme}
      boardId={boardId}
      depth={data.head.ancestors.length}
      title={data.head.title}
      canAdd={boardId !== UNCATEGORIZED_ID}
      trail={<BoardTrail ancestors={data.head.ancestors} current={data.head.title} isAdventure={theme === "adventure"} />}
    >
      <BoardBody data={data} theme={theme} />
    </BoardPeek>
  );
}

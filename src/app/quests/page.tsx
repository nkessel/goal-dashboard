import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuestsTabs } from "@/components/layout/QuestsTabs";
import { QuestList } from "@/components/boards/QuestList";
import { listBoardsForOwner } from "@/lib/data/boards";
import { getProfileById } from "@/lib/data/profiles";
import { listOpenTasksWithBoardForOwner } from "@/lib/data/tasks";

export default async function QuestListPage() {
  const session = await requireSession();
  const [tasks, boards, profile] = await Promise.all([
    listOpenTasksWithBoardForOwner(session.user.id),
    listBoardsForOwner(session.user.id),
    getProfileById(session.user.id),
  ]);
  const isAdventure = (profile?.theme ?? "adventure") === "adventure";
  const names = Object.fromEntries(boards.map((b) => [b.id, b.title]));
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="All Quests" calmTitle="All quests" subtitle="Every open quest in one list" />
        <QuestsTabs active="list" isAdventure={isAdventure} />
        <QuestList tasks={tasks} boards={names} isAdventure={isAdventure} />
      </div>
    </AppShell>
  );
}

export const metadata = { title: "Quest list" };

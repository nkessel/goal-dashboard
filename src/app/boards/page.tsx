import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";
import { BoardGrid } from "@/components/boards/BoardGrid";
import { listBoardsWithStatsForOwner } from "@/lib/data/boards";
import { getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";

export default async function BoardsPage() {
  const session = await requireSession();
  const [boards, profile] = await Promise.all([
    listBoardsWithStatsForOwner(session.user.id),
    getProfileById(session.user.id),
  ]);
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp).level : 1;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <PageHeader isAdventure={isAdventure} title="Quest Boards" calmTitle="Boards" subtitle="Your active campaigns" />
        </div>

        <CreateBoardForm theme={theme} />

        {boards.length === 0 ? (
          <p
            className="rounded-xl border border-dashed p-4 text-sm"
            style={{
              borderColor: isAdventure ? "rgba(243,233,207,.4)" : "var(--t-ink-soft)",
              color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)",
              opacity: isAdventure ? 0.75 : 1,
            }}
          >
            No quest boards yet. Create one to start grouping quests — e.g. &quot;Dreaming&quot;,
            &quot;Startup&quot;, &quot;Daily Tasks&quot;.
          </p>
        ) : (
          <BoardGrid boards={boards} theme={theme} />
        )}
      </div>
    </AppShell>
  );
}

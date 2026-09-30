import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
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
  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp).level : 1;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h1
              className={isAdventure ? "font-display text-xl" : "text-lg font-extrabold"}
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              {isAdventure ? "Quest Boards" : "Boards"}
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
          {isAdventure && (
            <div style={{ color: "var(--t-cream)", opacity: 0.7 }} className="text-sm">
              Your active campaigns
            </div>
          )}
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
            No boards yet. Create one to start grouping goals — e.g. &quot;Dreaming&quot;,
            &quot;Startup&quot;, &quot;Daily Tasks&quot;.
          </p>
        ) : (
          <BoardGrid boards={boards} theme={theme} />
        )}
      </div>
    </AppShell>
  );
}

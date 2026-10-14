import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { listPowerUps } from "@/lib/data/tasks";
import { PowerUpsList } from "@/components/powerups/PowerUpsList";

/** Start of a window `n` hours back (kept outside render for purity). */
function hoursAgoISO(n: number) {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

export default async function PowerUpsPage() {
  const session = await requireSession();
  const [profile, powerUps] = await Promise.all([
    getProfileById(session.user.id),
    listPowerUps(session.user.id, hoursAgoISO(18)).catch(() => ({ open: [], done: [] })),
  ]);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <PageHeader
          isAdventure={isAdventure}
          title="Power-Ups"
          subtitle="Every quest of 15 minutes or less — quick wins for a quick spark."
        />
        <PowerUpsList open={powerUps.open} done={powerUps.done} theme={profile.theme} />
        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={profile.theme} />
      </div>
    </AppShell>
  );
}

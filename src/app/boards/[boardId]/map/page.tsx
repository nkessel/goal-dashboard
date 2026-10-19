import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { loadCampaign } from "@/lib/data/campaign";
import { QuestMap } from "@/components/map/QuestMap";

/** A board as a quest map: one road through every quest in it and the boards inside. */
export default async function BoardMapPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const session = await requireSession();
  const campaign = await loadCampaign(boardId, session.user.id);
  if (!campaign) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <QuestMap board={campaign.board} stops={campaign.stops} />
    </AppShell>
  );
}

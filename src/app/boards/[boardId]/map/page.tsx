import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { loadCampaign } from "@/lib/data/campaign";
import { QuestMap } from "@/components/map/QuestMap";
import { getProfileById } from "@/lib/data/profiles";
import { defaultPortraitFor } from "@/components/settings/Avatar";

/** A board as a quest map: one road through every quest in it and the boards inside. */
export default async function BoardMapPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const session = await requireSession();
  const [campaign, profile] = await Promise.all([loadCampaign(boardId, session.user.id), getProfileById(session.user.id)]);
  const prefs = ((profile?.life_wheel as { mapPrefs?: Record<string, unknown> } | null)?.mapPrefs?.[boardId] ?? null) as Record<string, unknown> | null;
  if (!campaign) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <QuestMap board={campaign.board} stops={campaign.stops} initialPrefs={prefs} aspirations={campaign.aspirations} portrait={profile ? (profile.avatar_image_url ?? defaultPortraitFor(profile.id)) : null} />
    </AppShell>
  );
}

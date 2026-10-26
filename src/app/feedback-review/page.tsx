import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { isAdmin, listFeedbackForReview } from "@/lib/data/feedback";
import { FeedbackReview } from "@/components/feedback/FeedbackReview";

/** The app owner's queue: feedback from people in the party, one decision each. */
export default async function FeedbackReviewPage() {
  const session = await requireSession();
  const [profile, admin] = await Promise.all([getProfileById(session.user.id), isAdmin(session.user.id)]);
  if (!profile || !admin) notFound();
  const items = await listFeedbackForReview();
  const isAdventure = profile.theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="App Feedback" calmTitle="App feedback" subtitle="What your party would change. Decide what happens to each note." />
        <FeedbackReview items={items} theme={profile.theme} />
      </div>
    </AppShell>
  );
}

import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { getProfileById } from "@/lib/data/profiles";
import { listJournalEntries } from "@/lib/data/journal";
import { JournalList } from "@/components/journal/JournalList";
import { CreateFab } from "@/components/create/CreateFab";

export default async function JournalPage() {
  const session = await requireSession();
  const [profile, entries] = await Promise.all([getProfileById(session.user.id), listJournalEntries(session.user.id).catch(() => null)]);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        <PageHeader isAdventure={isAdventure} title="Journal" subtitle="Private notes to yourself — only you can see these." />
        <JournalList entries={entries} isAdventure={isAdventure} />
        <CreateFab kinds={["journal", "quest", "now"]} initial="journal" theme={profile.theme} label="New journal entry" />
      </div>
    </AppShell>
  );
}

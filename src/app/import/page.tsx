import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById } from "@/lib/data/profiles";
import { listBoardsForOwner } from "@/lib/data/boards";
import { listSetAsideImportCards, listWaitingImportCards } from "@/lib/data/import-cards";
import { ImportTriage } from "@/components/imports/ImportTriage";

export default async function ImportPage() {
  const session = await requireSession();
  const [profile, waiting, setAside, boards] = await Promise.all([
    getProfileById(session.user.id),
    listWaitingImportCards(session.user.id),
    listSetAsideImportCards(session.user.id),
    listBoardsForOwner(session.user.id).catch(() => []),
  ]);
  if (!profile) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <ImportTriage waiting={waiting} setAside={setAside} boards={boards.map((b) => ({ id: b.id, title: b.title, color: b.color }))} theme={profile.theme === "adventure" ? "adventure" : "calm"} />
    </AppShell>
  );
}

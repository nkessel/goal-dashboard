import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { getProfileById } from "@/lib/data/profiles";
import { listBoardsForOwner } from "@/lib/data/boards";
import { listSetAsideImportCards, listWaitingImportCards } from "@/lib/data/import-cards";
import { ImportTriage } from "@/components/imports/ImportTriage";
import { listSchedulingList } from "@/lib/data/scheduling";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ card?: string; q?: string }> }) {
  const session = await requireSession();
  const { card, q } = await searchParams;
  const [profile, waiting, setAside, boards, toSchedule] = await Promise.all([
    getProfileById(session.user.id),
    listWaitingImportCards(session.user.id),
    listSetAsideImportCards(session.user.id),
    listBoardsForOwner(session.user.id).catch(() => []),
    listSchedulingList(session.user.id).catch(() => []),
  ]);
  if (!profile) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <ImportTriage waiting={waiting} setAside={setAside} boards={boards.map((b) => ({ id: b.id, title: b.title, color: b.color }))} theme={profile.theme === "adventure" ? "adventure" : "calm"} toSchedule={toSchedule} focus={card ?? null} query={q ?? ""} />
    </AppShell>
  );
}

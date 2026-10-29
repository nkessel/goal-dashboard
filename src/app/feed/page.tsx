import Link from "next/link";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CreateFab } from "@/components/create/CreateFab";
import { PageHeader } from "@/components/layout/PageHeader";
import { FriendDirectory } from "@/components/social/FriendDirectory";
import { FriendRequests } from "@/components/social/FriendRequests";
import { InviteLinkBox } from "@/components/social/InviteLinkBox";
import { PartyWeekBoard } from "@/components/social/PartyView";
import { partyWeek } from "@/lib/data/activity";
import { currentWeekStart } from "@/lib/data/xp";
import { ActivityFeedItem } from "@/components/social/ActivityFeedItem";
import { listDirectory, getProfilesByIds, getProfileById, getChampion } from "@/lib/data/profiles";
import { LevelPill } from "@/components/social/LevelPill";
import { shownLevel } from "@/lib/shown-level";
import { Avatar } from "@/components/settings/Avatar";
import { xpToNextLevel } from "@/lib/data/xp";
import { levelCap } from "@/lib/data/bosses";
import {
  getFriendshipMap,
  listFriendIds,
  listIncomingRequests,
} from "@/lib/data/friendships";
import { getOrCreateInviteLink } from "@/lib/data/invites";
import { listFeed } from "@/lib/data/activity";
import { listThreads } from "@/lib/data/forum";
import { listSharedBoards } from "@/lib/data/party";
import { SupportCall } from "@/components/social/SupportCall";
import { SharedBoards } from "@/components/social/SharedBoards";
import { Forums, type AuthorView } from "@/components/social/Forums";

export default async function FeedPage() {
  const session = await requireSession();
  const profileId = session.user.id;

  const [directory, friendshipMap, incoming, friendIds, invite, profile] = await Promise.all([
    listDirectory(profileId),
    getFriendshipMap(profileId),
    listIncomingRequests(profileId),
    listFriendIds(profileId),
    getOrCreateInviteLink(profileId),
    getProfileById(profileId),
  ]);

  const [champion, shared, week] = await Promise.all([getChampion(), listSharedBoards(profileId), partyWeek([profileId, ...friendIds], currentWeekStart()).catch(() => [])]);
  const weekPeople = await getProfilesByIds(friendIds);
  // eslint-disable-next-line react-hooks/purity -- a server render's "now"
  const now = Date.now();
  const adders = await getProfilesByIds([...new Set(shared.flatMap((b) => b.quests.map((q) => q.added_by).filter((x): x is string => !!x)))]);
  const sharedViews = shared.map((b) => ({
    id: b.board.id,
    title: b.board.title,
    ownerId: b.owner.id,
    ownerName: b.owner.name?.split(" ")[0] ?? "A party member",
    quests: b.quests.map((q) => ({ id: q.id, title: q.title, xp: q.xp_value, addedBy: q.added_by ? (adders.get(q.added_by)?.name?.split(" ")[0] ?? null) : null })),
  }));
  const forums = await Promise.all((["party", "community", "ideas"] as const).map((sc) => listThreads(sc, profileId)));
  const threads = forums.flatMap((f) => f.threads);
  const forumPeople = await getProfilesByIds([...new Set(threads.map((t) => t.author_id).filter((x): x is string => !!x))]);
  const forumAuthors: Record<string, AuthorView> = Object.fromEntries(
    [...forumPeople.values()].map((p) => [p.id, { id: p.id, name: p.name ?? "Adventurer", level: shownLevel(p), avatar_color: p.avatar_color, avatar_image_url: p.avatar_image_url, champion: p.id === champion?.id }])
  );

  const incomingProfiles = await getProfilesByIds(incoming.map((f) => f.requester_id));
  const incomingWithProfiles = incoming
    .map((friendship) => ({ friendship, profile: incomingProfiles.get(friendship.requester_id)! }))
    .filter((r) => r.profile);

  const feed = await listFeed([profileId, ...friendIds], 30);
  const authorIds = feed.map((f) => f.owner_id);
  const commentAuthorIds = feed.flatMap((f) => f.comments.map((c) => c.profile_id));
  const allProfiles = await getProfilesByIds([...authorIds, ...commentAuthorIds]);

  const directoryRows = directory.map((p) => ({
    profile: p,
    friendship: friendshipMap.get(p.id),
  }));

  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp, await levelCap(session.user.id).catch(() => 10)).level : 1;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-5">
        <PageHeader isAdventure={isAdventure} title="Guild Hall" calmTitle="Friends" />

        {champion && champion.total_xp > 0 && (
          <Link
            href={champion.id === profileId ? "/" : `/friends/${champion.id}`}
            aria-label={`Champion of Quests: ${champion.name ?? "Adventurer"}. See their screens`}
            className="hover-glow flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "linear-gradient(180deg, rgba(42,32,14,.92), rgba(24,18,8,.92))", border: "1.5px solid rgba(242,210,126,.6)", boxShadow: "0 0 18px rgba(242,210,126,.18)" }}
          >
            <span className="relative shrink-0">
              <Avatar profile={champion} size={14} />
              {/* eslint-disable-next-line @next/next/no-img-element -- crown */}
              <img src="/design/ui-crown.svg" alt="" width={28} height={28} className="absolute -top-4 left-1/2 h-7 w-7 -translate-x-1/2 -rotate-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "#f2d27e" }}>
                Champion of Quests
              </span>
              <span className={`flex flex-wrap items-center gap-1.5 ${isAdventure ? "font-display text-[19px]" : "text-[17px] font-bold"}`} style={{ color: "#f6ecd2" }}>
                {champion.name ?? "Adventurer"}
                <LevelPill level={shownLevel(champion)} />
              </span>
              <span className="block text-[13px] tabular-nums" style={{ color: "rgba(246,236,210,.75)" }}>
                {champion.total_xp.toLocaleString()} XP — the most of anyone
                {champion.id === profileId ? " (that's you!)" : ""}
              </span>
            </span>
          </Link>
        )}

        {/* Inviting is right at the top, where it's easy to find. */}
        <InviteLinkBox code={invite.code} theme={theme} inviterName={profile?.name?.split(" ")[0] ?? null} prominent />

        <FriendRequests incoming={incomingWithProfiles} theme={theme} />

        {/* Finding people already here: near the top, open while the party is small. */}
        <details open={friendIds.length < 3} className={`rounded-2xl px-4 py-3 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
          <summary className={`relative z-[1] flex min-h-10 cursor-pointer list-none items-center gap-2.5 ${isAdventure ? "font-display text-[19px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="8" r="3.2" stroke="#2a1c10" strokeWidth="2" />
                <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" stroke="#2a1c10" strokeWidth="2" strokeLinecap="round" />
                <circle cx="16.8" cy="9" r="2.4" stroke="#2a1c10" strokeWidth="1.8" />
                <path d="M16 13.6c2.4 0 4 1.5 4.5 4" stroke="#2a1c10" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            Find your party
            <span className="ml-auto text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>
              people already here ▾
            </span>
          </summary>
          <div className="relative z-[1] mt-3">
            <FriendDirectory profileId={profileId} rows={directoryRows} theme={theme} championId={champion?.id ?? null} />
          </div>
        </details>


        <PartyWeekBoard
          isAdventure={isAdventure}
          members={week.map((w) => {
            const p = w.id === profileId ? profile : weekPeople.get(w.id);
            return {
              id: w.id,
              name: p?.name?.split(" ")[0] ?? "A friend",
              isYou: w.id === profileId,
              streak: p?.streak_count ?? 0,
              xp: w.xp,
              quests: w.quests,
              quietDays: w.lastQuestAt ? Math.floor((now - new Date(w.lastQuestAt).getTime()) / 86_400_000) : 14,
            };
          })}
        />

        <SupportCall partySize={friendIds.length} isAdventure={isAdventure} />

        <Forums threads={threads} voted={forums[2].voted} authors={forumAuthors} theme={theme} />

        <SharedBoards boards={sharedViews} viewerId={profileId} isAdventure={isAdventure} />

        <section className="flex flex-col gap-3" aria-label="Party activity">
          <h2 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-[16px] font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Party activity
          </h2>
          <ul className="flex flex-col gap-3">
            {feed.map((item) => (
              <ActivityFeedItem
                key={item.id}
                item={item}
                author={allProfiles.get(item.owner_id)}
                profiles={allProfiles}
                viewerId={profileId}
                theme={theme}
              />
            ))}
            {feed.length === 0 && (
              <p
                className="rounded-xl border border-dashed p-4 text-sm"
                style={{
                  borderColor: isAdventure ? "rgba(243,233,207,.4)" : "var(--t-ink-soft)",
                  color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)",
                  opacity: isAdventure ? 0.75 : 1,
                }}
              >
                Nothing here yet — completions from you and your friends show up as they happen.
              </p>
            )}
          </ul>
        </section>

        <CreateFab kinds={["quest", "habit", "rite", "reward", "journal"]} theme={theme} />
      </div>
    </AppShell>
  );
}

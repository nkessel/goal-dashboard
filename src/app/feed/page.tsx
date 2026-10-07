import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FriendDirectory } from "@/components/social/FriendDirectory";
import { FriendRequests } from "@/components/social/FriendRequests";
import { InviteLinkBox } from "@/components/social/InviteLinkBox";
import { ActivityFeedItem } from "@/components/social/ActivityFeedItem";
import { listDirectory, getProfilesByIds, getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";
import {
  getFriendshipMap,
  listFriendIds,
  listIncomingRequests,
} from "@/lib/data/friendships";
import { getOrCreateInviteLink } from "@/lib/data/invites";
import { listFeed } from "@/lib/data/activity";

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

  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";
  const level = profile ? xpToNextLevel(profile.total_xp).level : 1;

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-5">
        <PageHeader isAdventure={isAdventure} title="Guild Hall" calmTitle="Friends" />

        <FriendRequests incoming={incomingWithProfiles} theme={theme} />

        <section className="flex flex-col gap-3">
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

        <InviteLinkBox code={invite.code} theme={theme} />

        <section className="flex flex-col gap-2 rounded-2xl px-4 py-3.5" style={{
          background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
            {isAdventure ? "The Realm" : "Directory"}
          </h2>
          <FriendDirectory profileId={profileId} rows={directoryRows} theme={theme} />
        </section>
      </div>
    </AppShell>
  );
}

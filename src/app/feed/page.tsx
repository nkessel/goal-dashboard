import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { FriendDirectory } from "@/components/social/FriendDirectory";
import { FriendRequests } from "@/components/social/FriendRequests";
import { InviteLinkBox } from "@/components/social/InviteLinkBox";
import { ActivityFeedItem } from "@/components/social/ActivityFeedItem";
import { listDirectory, getProfilesByIds } from "@/lib/data/profiles";
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

  const [directory, friendshipMap, incoming, friendIds, invite] = await Promise.all([
    listDirectory(profileId),
    getFriendshipMap(profileId),
    listIncomingRequests(profileId),
    listFriendIds(profileId),
    getOrCreateInviteLink(profileId),
  ]);

  const incomingProfiles = await getProfilesByIds(incoming.map((f) => f.requester_id));
  const incomingWithProfiles = incoming
    .map((friendship) => ({ friendship, profile: incomingProfiles.get(friendship.requester_id)! }))
    .filter((r) => r.profile);

  const feed = await listFeed([profileId, ...friendIds], 30);
  const authorIds = feed.map((f) => f.owner_id);
  const commentAuthorIds = feed.flatMap((f) => f.comments.map((c) => c.profile_id));
  const allProfiles = await getProfilesByIds([...authorIds, ...commentAuthorIds]);

  const directoryRows = directory.map((profile) => ({
    profile,
    friendship: friendshipMap.get(profile.id),
  }));

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Friend Feed</h1>

        <FriendRequests incoming={incomingWithProfiles} />

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Activity</h2>
          <ul className="flex flex-col gap-3">
            {feed.map((item) => (
              <ActivityFeedItem
                key={item.id}
                item={item}
                author={allProfiles.get(item.owner_id)}
                profiles={allProfiles}
                viewerId={profileId}
              />
            ))}
            {feed.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                Nothing here yet — completions from you and your friends show up as they happen.
              </p>
            )}
          </ul>
        </section>

        <InviteLinkBox code={invite.code} />

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Directory</h2>
          <FriendDirectory profileId={profileId} rows={directoryRows} />
        </section>
      </div>
    </AppShell>
  );
}

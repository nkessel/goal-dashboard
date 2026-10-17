import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listFriendIds } from "./friendships";
import { SHARE_SCREENS, type ShareSettings } from "@/lib/sharing";

export async function getShareSettings(ownerId: string): Promise<ShareSettings> {
  const { data } = await supabaseAdmin().from("profiles").select("share_settings").eq("id", ownerId).maybeSingle<{ share_settings: ShareSettings | null }>();
  return data?.share_settings ?? {};
}

export async function setShareSettings(ownerId: string, patch: ShareSettings): Promise<ShareSettings> {
  const now = await getShareSettings(ownerId);
  const next: ShareSettings = { ...now };
  for (const s of SHARE_SCREENS) if (typeof patch[s.key] === "boolean") next[s.key] = patch[s.key];
  const { error } = await supabaseAdmin().from("profiles").update({ share_settings: next }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  return next;
}

/** Party members (accepted, both ways) may look; nobody else. */
export async function isPartyMember(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  return (await listFriendIds(viewerId)).includes(ownerId);
}

export async function setTaskPrivate(ownerId: string, taskId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabaseAdmin().from("tasks").update({ is_private: isPrivate }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
}

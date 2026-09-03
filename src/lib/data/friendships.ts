import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Friendship } from "./types";

/** Accepted friendships, returned as the *other* profile's id per row. */
export async function listFriendIds(profileId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) throw new Error(`Failed to list friends: ${error.message}`);
  return (data ?? []).map((row) =>
    row.requester_id === profileId ? row.addressee_id : row.requester_id
  );
}

export async function listIncomingRequests(profileId: string): Promise<Friendship[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("addressee_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list incoming requests: ${error.message}`);
  return data ?? [];
}

export async function listOutgoingRequests(profileId: string): Promise<Friendship[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .eq("requester_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list outgoing requests: ${error.message}`);
  return data ?? [];
}

/**
 * All friendship rows (any status) touching profileId, keyed by the *other*
 * profile's id — lets the directory show "friends / pending / add" state
 * per row without an N+1 query per user.
 */
export async function getFriendshipMap(
  profileId: string
): Promise<Map<string, Friendship>> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) throw new Error(`Failed to load friendship map: ${error.message}`);
  const map = new Map<string, Friendship>();
  for (const row of data ?? []) {
    const otherId = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    map.set(otherId, row as Friendship);
  }
  return map;
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<Friendship> {
  if (requesterId === addresseeId) throw new Error("Can't friend yourself");

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .insert({ requester_id: requesterId, addressee_id: addresseeId, status: "pending" })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("A friend request already exists between you two");
    throw new Error(`Failed to send friend request: ${error.message}`);
  }
  return data;
}

export async function getFriendship(id: string): Promise<Friendship | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("friendships").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load friendship: ${error.message}`);
  return data;
}

/** Only the addressee may accept/decline; enforced by the caller passing profileId. */
export async function respondToFriendRequest(
  friendshipId: string,
  addresseeId: string,
  accept: boolean
): Promise<Friendship> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("friendships")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", friendshipId)
    .eq("addressee_id", addresseeId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to respond to friend request: ${error.message}`);
  return data;
}

export async function removeFriendship(friendshipId: string, profileId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);

  if (error) throw new Error(`Failed to remove friendship: ${error.message}`);
}

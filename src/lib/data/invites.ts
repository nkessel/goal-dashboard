import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { InviteLink } from "./types";

export async function getOrCreateInviteLink(profileId: string): Promise<InviteLink> {
  const db = supabaseAdmin();

  const existing = await db
    .from("invite_links")
    .select("*")
    .eq("created_by", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) throw new Error(`Failed to load invite link: ${existing.error.message}`);
  if (existing.data) return existing.data;

  const { data, error } = await db
    .from("invite_links")
    .insert({ created_by: profileId })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create invite link: ${error.message}`);
  return data;
}

export async function getInviteByCode(code: string): Promise<InviteLink | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("invite_links")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(`Failed to load invite: ${error.message}`);
  if (data?.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data;
}

export async function incrementInviteUse(id: string): Promise<void> {
  const db = supabaseAdmin();
  // Read-modify-write is fine at this scale (invite redemption isn't hot).
  const current = await db.from("invite_links").select("uses_count").eq("id", id).single();
  if (!current.error) {
    await db
      .from("invite_links")
      .update({ uses_count: (current.data.uses_count ?? 0) + 1 })
      .eq("id", id);
  }
}

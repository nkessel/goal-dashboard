import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service_role key.
 * Auth/identity is handled by NextAuth (Google), not Supabase Auth, so all
 * reads/writes from server code (route handlers, server actions) go through
 * this client and bypass RLS. NEVER import this from a "use client" file.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Grab it from the Supabase dashboard: " +
        "Project Settings -> API -> Legacy API Keys -> service_role, and add it to .env.local. " +
        "Never expose this key to the browser."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client using the public anon key.
 * RLS policies (see supabase/migrations/0001_init.sql) only allow public
 * SELECTs on non-private rows — everything else goes through our own
 * server routes, which use the service_role key.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

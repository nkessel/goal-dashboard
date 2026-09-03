// Mints a real Auth.js v5 session cookie for a throwaway test profile, so
// we can drive the actual running app with Playwright without needing a
// real interactive Google OAuth login (which needs a human + real Google
// credentials neither this script nor Claude should ever handle).
//
// Uses the app's own NEXTAUTH_SECRET (same as auth.ts) via next-auth/jwt's
// encode(), so the resulting cookie is indistinguishable from one issued by
// a real sign-in — session()/auth() decode it exactly the same way.
//
// Usage: node scripts/mint-test-session.mjs [--name "Test User"] [--email test@example.com]
import { readFileSync, writeFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, arr) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), arr[i + 1]]);
    return pairs;
  }, [])
);

const stamp = Date.now();
const name = args.name || `Test User ${stamp}`;
const email = args.email || `playwright-test-${stamp}@example.com`;

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: profile, error } = await db
  .from("profiles")
  .insert({ google_sub: `playwright-${stamp}`, email, name })
  .select("*")
  .single();
if (error) throw error;

const token = {
  name,
  email,
  picture: null,
  sub: profile.id,
  googleSub: profile.google_sub,
  profileId: profile.id,
  // No accessToken/refreshToken on purpose — Calendar-dependent actions
  // should fail gracefully with "sign out and back in" rather than crash.
};

const cookieValue = await encode({
  token,
  secret: env.NEXTAUTH_SECRET,
  salt: "authjs.session-token",
});

writeFileSync(
  new URL("./.test-session.json", import.meta.url),
  JSON.stringify({ profileId: profile.id, email, name, cookieValue }, null, 2)
);

console.log(`Minted session for profile ${profile.id} (${email})`);
console.log(`Saved to scripts/.test-session.json`);

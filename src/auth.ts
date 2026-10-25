import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabaseAdmin } from "@/lib/supabase/server";

// Signing in only asks for who you are. Calendar access is optional and is
// asked for separately, from the Calendar page (connectGoogleCalendar below).
const BASE_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"];
// Pull-to-calendar both reads free/busy AND creates events on the primary
// calendar, so read-only isn't enough.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** Authorization params for the "Connect Google Calendar" step (incremental consent). */
export const CALENDAR_AUTH_PARAMS = {
  scope: [...BASE_SCOPES, CALENDAR_SCOPE].join(" "),
  access_type: "offline", // a refresh_token, so the calendar keeps working
  prompt: "consent",
  include_granted_scopes: "true",
};

async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const tokens = await response.json();
  if (!response.ok) {
    throw new Error(
      `Failed to refresh Google access token: ${tokens.error ?? response.status}`
    );
  }

  return {
    accessToken: tokens.access_token as string,
    accessTokenExpires: Date.now() + tokens.expires_in * 1000,
    // Google only returns a new refresh_token occasionally; keep the old one otherwise.
    refreshToken: (tokens.refresh_token as string | undefined) ?? refreshToken,
  };
}

// Each preview deploy gets a new address, and Google only sends sign-ins back
// to addresses listed ahead of time. So on Vercel, sign-in goes through the
// live site, which hands you back to the preview you started from.
const SIGN_IN_PROXY = process.env.AUTH_REDIRECT_PROXY_URL ?? (process.env.VERCEL ? "https://goal-dashboard-kappa.vercel.app/api/auth" : undefined);

export const { handlers, auth, signIn, signOut } = NextAuth({
  redirectProxyUrl: SIGN_IN_PROXY,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: BASE_SCOPES.join(" "),
          // Re-signing in shouldn't drop a calendar already connected.
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Persist the Google OAuth tokens + a stable app-side profile id on the JWT.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.googleSub = profile.sub as string;
        token.accessToken = account.access_token;
        token.scope = account.scope;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : undefined;

        // Upsert the profile row keyed by the Google subject id.
        const db = supabaseAdmin();
        const { data, error } = await db
          .from("profiles")
          .upsert(
            {
              google_sub: profile.sub,
              email: profile.email,
              name: profile.name,
              avatar_url: (profile as { picture?: string }).picture,
            },
            { onConflict: "google_sub" }
          )
          .select("id")
          .single();

        if (error) {
          console.error("Failed to upsert profile on sign-in:", error);
        } else {
          token.profileId = data.id;
        }

        return token;
      }

      // Subsequent requests: refresh the access token if it's expired (or
      // about to be, within 60s) and we have a refresh token to use.
      const expiresAt = token.accessTokenExpires ?? 0;
      if (token.refreshToken && Date.now() > expiresAt - 60_000) {
        try {
          const refreshed = await refreshGoogleAccessToken(token.refreshToken);
          token.accessToken = refreshed.accessToken;
          token.accessTokenExpires = refreshed.accessTokenExpires;
          token.refreshToken = refreshed.refreshToken;
        } catch (err) {
          console.error("Google token refresh failed:", err);
          // Leave the stale token in place; Calendar calls will fail and the
          // UI should prompt a re-sign-in. Not throwing keeps the app session alive.
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.profileId as string;
      }
      // Exposed (only once Calendar access is granted) so server components
      // and route handlers can call the Calendar API on the user's behalf.
      // Do not send this to client components. Sessions from before scopes
      // were tracked all had Calendar access.
      const calendar = token.scope ? token.scope.split(" ").includes(CALENDAR_SCOPE) : !!token.accessToken;
      session.googleAccessToken = calendar ? (token.accessToken as string | undefined) : undefined;
      return session;
    },
  },
  pages: {
    signIn: "/", // single-page sign-in for v1; revisit once there's a real landing page
  },
});

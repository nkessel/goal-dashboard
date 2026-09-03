import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabaseAdmin } from "@/lib/supabase/server";

// Scopes: base identity (openid/email/profile) + read-only Google Calendar
// access for the "all open gaps are available" scheduling logic (spec:
// Scheduling / Calendar Integration). Bump to the read-write scope later if
// v2 needs the app to create events directly instead of just reading gaps.
const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline", // request a refresh_token
          prompt: "consent", // force refresh_token on every sign-in while in testing
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.profileId as string;
      }
      // Exposed so server components/route handlers can call the Calendar
      // API on the user's behalf. Do not send this to client components.
      session.googleAccessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/", // single-page sign-in for v1; revisit once there's a real landing page
  },
});

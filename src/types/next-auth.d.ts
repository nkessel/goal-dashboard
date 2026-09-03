import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    googleAccessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleSub?: string;
    profileId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

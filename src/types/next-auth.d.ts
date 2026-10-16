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
    scope?: string;
    googleSub?: string;
    profileId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

// next-auth/jwt re-exports from @auth/core/jwt, and TS module augmentation
// targets the augmented module's own identity — augmenting the re-export
// alone doesn't reach callback params typed from the underlying module, so
// this needs augmenting too.
declare module "@auth/core/jwt" {
  interface JWT {
    scope?: string;
    googleSub?: string;
    profileId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}

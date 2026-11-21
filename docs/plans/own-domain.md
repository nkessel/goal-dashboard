# Moving the app to tinyquests.win (and ending Google's warnings)

Owner picked **tinyquests.win** (Nov 21). Branch `review/own-domain`. Nothing here is live until the owner says so.

## Why the warnings show
- Connecting Calendar asks for `https://www.googleapis.com/auth/calendar`, a Google **sensitive** scope. Until Google verifies the app, everyone sees "Google hasn't verified this app".
- Verification needs a domain the owner controls (a `*.vercel.app` address can't be verified in Search Console), a public home page that describes the app, and a privacy policy and terms on that domain.
- If the Google project is still in **Testing**, only listed test users can sign in and Calendar refresh tokens expire after 7 days.

## Code on this branch
- `src/lib/site.ts`: `SITE_URL` (env `NEXT_PUBLIC_SITE_URL`, default the vercel.app address) and `APP_NAME`. Sign-in's redirect proxy (`src/auth.ts`) and `metadataBase` follow it.
- Public home page (signed out `/`), `/privacy`, `/terms` (design review first).

## Order of steps (each needs the owner's yes)
1. Buy tinyquests.win on Namecheap.
2. Vercel › project › Settings › Domains: add `tinyquests.win` (and `www`), redirect the vercel.app address to it. Add the DNS records Vercel shows in Namecheap › Advanced DNS.
3. Google Search Console: add the domain property, put its TXT record in Namecheap, verify.
4. Merge this branch after the design review; set `NEXT_PUBLIC_SITE_URL=https://tinyquests.win` in Vercel (owner sets env vars).
5. Google Cloud Console (owner):
   - Clients › the web client › Authorized redirect URIs: add `https://tinyquests.win/api/auth/callback/google` (keep the old one until the move is done).
   - Branding: app name (same as the home page), logo, home page `https://tinyquests.win`, privacy `https://tinyquests.win/privacy`, terms `https://tinyquests.win/terms`, authorized domain `tinyquests.win`, support email.
   - Audience: Publish app (Testing → In production).
   - Data access: keep openid/email/profile and `.../auth/calendar`; submit for verification with the justification below and a demo video (unlisted YouTube) showing sign-in, the consent screen with the app name, connecting Calendar, and each Calendar feature in use.
6. Sign up end to end on the new address once Google approves.

## Scope justification (draft for the Data access form)
Tiny Quests is a personal planner that turns tasks into quests. When a user chooses "Connect Google Calendar", the app reads their calendar list and events to show their day next to their quests, checks free/busy to find open time, and creates, moves or deletes the calendar events for quests the user places on their calendar. Calendar data is only shown to the signed-in user, is not sold, used for ads, or used to train AI models.

Open question before submitting: Google prefers the narrowest scopes. The code uses calendarList.list, events list/get/insert/patch/delete and freebusy (`src/lib/google-calendar.ts`), which narrower scopes (events, calendar list read-only, free/busy) may cover. Check Google's current scope list before switching; existing users would need to reconnect.

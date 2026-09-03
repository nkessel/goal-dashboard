# Project Spec: Personal + Social Goal & Task Dashboard

## Setup Checklist (do these before opening Claude Code)

None of this requires coding — just signing up for free accounts and copying some keys into one safe place. Budget about 30-40 minutes total. **Create a plain text file or a note called "dashboard-keys" right now** — you'll paste every credential below into it as you go, then hand the whole thing to Claude Code later.

### 1. GitHub account (you'll need this anyway to store your code)
- Go to github.com → sign up if you don't already have an account
- Nothing else to configure here yet

### 2. Google Cloud project (for Google login + Calendar sync)
Google reorganized this console recently, so here's the current path:
1. Go to `console.cloud.google.com/projectcreate`, sign in with your Google account
2. Give the project a name (e.g. "goal-dashboard"), click **Create**, then make sure it's selected in the project dropdown at the top of the page
3. In the left menu (or top search bar), find **"OAuth consent screen"** (may also show as "Google Auth Platform") and click **Get started**
4. Fill out the short wizard:
   - **App Information**: app name + your email
   - **Audience**: choose **External** (this lets any Google account sign in — Internal only works for org accounts, don't pick that)
   - **Contact Information**: your email again
   - Accept the policy → **Create**
5. Go to the **Audience** tab → click **Add users** → add your own Google email (and any friends who'll test it with you). This is required — without it, sign-in will be blocked while the app is in test mode
6. Go to the **Data access** tab → click **Add or remove scopes** → check the boxes for `openid`, `.../userinfo.email`, and `.../userinfo.profile` → **Update**
7. In the left menu, find **"Library"**, search **"Google Calendar API"**, click it, click **Enable**
8. Go to the **Clients** tab → **Create Client**
   - Application type: **Web application**
   - Name: anything (e.g. "goal-dashboard-web")
   - Authorized redirect URIs: leave this for now — Claude Code will tell you the exact URL to add once your app has a real address (you can come back and add it in 30 seconds later)
   - Click **Create**
9. A popup shows your **Client ID** and **Client Secret** — copy both into your keys file right now. **The secret will not be shown again** — if you lose it, you'll need to create a new one from the Clients tab

### 3. Anthropic API key (powers the "talk to add tasks" feature)
1. Go to `console.anthropic.com`, sign in or create an account
2. Go to **API Keys** in the left menu → **Create Key**
3. Copy the key into your keys file immediately — it's only shown once

### 4. Database — Supabase (recommended for beginners; also handles user accounts)
1. Go to `supabase.com` → sign up (free tier is fine)
2. Click **New Project**, pick a name, and set a database password — **save this password in your keys file too**
3. Wait a minute or two while it provisions
4. Once it's ready, go to **Project Settings → API**
5. Copy the **Project URL** and the **anon public key** into your keys file

### 5. Hosting — Vercel
1. Go to `vercel.com` → sign up using your GitHub account (this links them automatically)
2. Nothing else to set up yet — once Claude Code has built something, it can walk you through connecting your project folder to Vercel and deploying it live

### When you're done
You should have five things saved in your keys file: **Google Client ID**, **Google Client Secret**, **Anthropic API key**, **Supabase Project URL**, and **Supabase anon key** (plus your Supabase database password). That's everything Claude Code will ask for as it wires up login, calendar sync, the database, and the AI chat feature.

## Once the above is done
- Open Claude Code in a new empty project folder
- Share this spec document with it (paste it in or point it at the file)
- Give it your saved keys/IDs when it asks for them during setup
- Follow the "Suggested Build Priority" order at the bottom of this doc — start with data models and Google auth, save the social/gamification layer for later
- Expect to build in stages and test as you go, rather than all at once — that's normal for a project this size

---

## One-line summary
A mobile-responsive web app that syncs with Google Calendar, combining personal task/goal management with a social, gamified layer where friends can see and cheer each other's progress.

---

## Core Entities

### Task
- Title, optional description
- Priority via **Eisenhower matrix**: separate **importance** and **urgency** scores (not a single 1-3 priority number)
- **Reschedule count**: increments every time the task is moved; drives a visual "redness" gradient (subtle red tint at 1 reschedule, scaling to fully intense red at 8+ reschedules)
- Optional custom color and/or icon (see "Task Icons" below) — user-assigned color blends with/gets overridden by the reschedule-redness indicator
- XP value: user-assigned (see XP/Gamification below), constrained by a weekly budget
- Can be pulled onto the calendar (see Scheduling below)
- Belongs to zero or more Goal Boards

### Goal
- Title, description
- **Progress bar**: a manually-set slider (0-100%), with plus/minus buttons and a draggable tick — progress is fully decoupled from subtask completion, so goals work whether or not they've been broken into subtasks
- Optional subtasks (regular Tasks, linked to the goal, purely organizational/supportive — they do not drive the progress %)
- Belongs to a Goal Board
- Public by default; can be marked private

### Goal Board
- A flexible category/container for goals (examples from user: "Dreaming" for long-term aspirations, "Startup" for a specific project, "Daily Tasks")
- User-defined, unlimited number
- Public by default at the board or goal level; can be made private

### Task Icons ("Monster Profiles" — Adventure theme only)
- Curated set of 15-20 fantasy "enemy" icons (dragons, evil sorcerers, spirits, goblins, etc.) assignable to tasks
- Also integrate a searchable icon/emoji library (e.g. free icon API) so users aren't limited to the curated set — e.g. searching "chicken" should return a usable icon
- Completing a task = "defeating" its assigned monster (Adventure mode framing only)

### Retroactive Completion
- Tasks can be marked complete **after the fact**, with an optional date/time picker for when it was actually done (defaults to the current date/time if not changed)
- Useful for logging things you finished but forgot to check off in the moment

### Completed Tasks Display
- **Priority view**: a "Completed" list appears directly beneath the current top-priorities section — a running, visible list of recently finished tasks as a morale boost
- **Priority Matrix view**: completed tasks also appear in a list beneath the matrix (not plotted on the matrix itself, since importance/urgency no longer apply once done)
- **Calendar view**: completed tasks show inline on the calendar at their scheduled (or completed) time, formatted as `✅ [task name]` — reinforces completion right where the task originally lived, rather than being pulled into a separate list

---

## Scheduling / Calendar Integration
- **Google Calendar sync** (real, two-way where feasible)
- v1 logic: treat **all open gaps in the user's Google Calendar as available** — no time-of-day preferences yet (e.g. no "mornings only" or "no lunch block"); flag this as a fast-follow feature
- **Pull-to-calendar flow**: any task or goal can be pulled onto the calendar
  - App suggests the **next 3 open slots**
  - User picks one, or manually selects a different time via a button
- Rescheduling a task increments its reschedule count (see above)

---

## Views / Navigation
Sidebar of view-switcher icons (left side). Views:
1. **Priority** (default landing view)
2. **Calendar**
3. **Priority Matrix** — scatter/graph view plotting tasks by importance (y) and urgency (x); filterable by a single board or "all boards"; hover on a task to see details
4. **Boards**
5. **Friend Feed**

### Priority View (default)
- Center of the page: a **manually curated** "top 1-3 priorities" list — NOT auto-populated by importance/urgency scores, the user chooses what goes here each session/day
- Below/around it: a collapsible drawer containing all other tasks
- Beneath that: a **Completed** list (see Retroactive Completion / Completed Tasks Display, under Task) — recently finished tasks, shown as a morale boost

---

## Social Layer
- **Public by default**, with per-goal/per-board privacy toggle to make private
- **Friend directory / adding friends (v1 approach)**:
  - Show all registered users as a discoverable directory/list to add as friends (viable at small scale)
  - Invite links to bring in new users
  - Contact import as a nice-to-have if easy to implement
  - Formal "Teams" — explicitly deferred to a later version
- **Activity Feed**:
  - Full feed of friends' completions (tasks/goals)
  - **Reactions**: any emoji, not just a fixed set
  - **Comments**: full threaded/full-text comments, not just reactions
- **Onboarding flow** should end with a "select your friends" screen showing suggested users (from the directory) to add immediately

---

## Gamification / XP System
- Users **self-assign XP value per task**
- To prevent inflation (assigning huge XP to everything), use a **weekly XP budget**: users have a fixed pool of points to distribute across tasks per week
  - Add a **small daily login/check-in bonus** (flat bonus or streak multiplier) to encourage daily habit-forming even though the core budget is weekly — avoids punishing multi-day tasks or days where the user is busy living life
- XP accumulates toward a **character/level system**, levels 1-10 to start, with level-based perks:
  - **Levels 1-3 (cosmetic tier)**: new avatar gear/armor unlocks, new minimal-mode color palettes
  - **Levels 4-7 (functional tier)**: small weekly XP budget increase per level; a "streak protection" token that guards against a missed day
  - **Levels 8-10 (prestige tier)**: rare/exclusive monster icons for tasks, a visible title/flair next to your name in the friend feed (e.g. "Level 9 Adventurer") shown on comments/reactions
  - Board customization (custom colors/backgrounds, extra board slots) can be sprinkled across tiers as a stretch feature
- Consider (open question, not yet resolved): whether/how importance+urgency score should cap or influence the XP range a task can be assigned, so the budget nudges users toward spending points on what actually matters

---

## Notifications
- **In-app notifications** for all events (reactions, comments, reschedule reminders, etc.)
- **Email notifications** for higher-value moments only (e.g. a friend cheering a completed goal, an upcoming reschedule reminder) — not every minor interaction
  - Suggested provider: Resend or SendGrid (both have generous free tiers, low cost to start)
- Push notifications: explicitly deferred (no native app in v1)

---

## Visual Themes
Two full, switchable skins (user-selectable, presumably a personal setting):

1. **Calm / Minimal mode**
   - Muted tones, lots of whitespace, gentle transitions, plain/simple wording
   - Mindfulness-inspired, low-stimulation, good for focus

2. **Playful / Adventure mode**
   - Medieval fantasy battle theme
   - Bright colors, bouncy animations, celebratory moments on level-up/goal completion
   - User can build/customize an avatar
   - Today's top priorities are framed as "the battle of the day"
   - Tasks show "monster profile" icons (see Task Icons above)

Open question: whether some elements (e.g. XP visibility) should be hidden in Calm mode — user leaned toward keeping XP visible even in Calm mode, but flagged as worth reconsidering during design.

---

## Conversational Task/Goal Creation (Claude-powered)
- A persistent chat interface within the dashboard where the user can create and manage tasks/goals via free-form natural language, instead of filling out structured forms
- Powered by the Anthropic API (Claude), which parses the user's message into structured data — e.g. "remind me to finish the pitch deck by Friday, it's pretty important" → extracts title, due date, importance/urgency
- Should support the actions already defined elsewhere in this spec, not just creation:
  - Create a task or goal
  - Reschedule a task ("reschedule this to the next available time" — should trigger the same 3-slot suggestion flow described under Scheduling)
  - Update goal progress ("mark pitch deck 50% done")
  - Assign XP, priority (importance/urgency), or a monster icon during creation if mentioned
- Implementation notes for Claude Code:
  - Use a system prompt that instructs Claude to output structured JSON matching the Task/Goal schema, with the user's free-text as input
  - Backend validates/applies the returned JSON against the app's data model (create/update record) rather than trusting raw text
  - Should confirm back to the user in plain language what was created/changed (e.g. "Added 'Call dentist' — urgent, importance 2")
  - Voice input (browser speech-to-text feeding the same text pipeline) is a natural fast-follow once text-based conversational entry works

---

## Platform / Tech Stack Notes
- **Mobile-responsive web app only for v1** — no native iOS/Android app
  - Rationale: Apple charges $99/year for a developer account to publish; Google Play is a one-time $25 fee. Avoid this cost/overhead until the product is validated.
  - Native app (iOS especially) is a real future goal, not abandoned — just deferred
- Auth: sign in with Google (dual purpose — also enables Google Calendar sync)

---

## Explicitly Deferred / Future Features
- Formal "Teams" (beyond ad-hoc friend directory)
- Push notifications / native mobile app
- Calendar scheduling preferences (time-of-day constraints, blocked times)
- Open username/email search for friends (directory + invite links cover v1)
- Level-based perks (concept confirmed, specifics undefined)

---

## Suggested Build Priority (for Claude Code)
1. Data models: User, Task, Goal, Board, XP/Weekly Budget, Friend relationships
2. Google OAuth + Calendar read/sync
3. Core CRUD for tasks/goals/boards + Priority view with manual top-3 + drawer
4. Pull-to-calendar flow with 3-slot suggestion logic
5. Reschedule tracking + redness gradient UI
6. Priority Matrix view
7. Social: friend directory, activity feed, reactions/comments
8. XP system + weekly budget + leveling
9. Notifications (in-app, then email)
10. Two visual themes (Calm / Adventure) including avatar builder and monster-icon picker with search fallback

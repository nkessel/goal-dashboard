# The social side: data model, rules and build plan

Written Nov 16 (high-effort design pass) for the owner's notes 6d473d8d ("VERY VERY important… invite a friend to a quest or a part of a quest or a board or anything… choose to (not) share victories"), 80ac8b67 ("split XP percentages with my teammate(s) on any quest/etc") and f8e7f00a ("we still need a toggle for sharing with my quest party").

**Status: design only. Nothing here is built.** Section 9 lists the owner's open questions; each has a default marked **(default)**. Don't build a part whose question is still open unless the owner has answered it or said "go with the defaults". Everything on screen goes through the design review (`CLAUDE.md`).

## 1. What exists today (checked in the code and the database, Nov 16)

- **Party = every accepted friend** (`friendships`, `listFriendIds`). There are no groups. 6 profiles, 4 friendships.
- **Party-wide visibility:** `profiles.share_settings` (one switch per screen: today, boards, calendar, insights), `tasks.is_private`, `boards.is_private`. A friend's page (`/friends/[id]`) reads through these.
- **Boards shared with the whole party:** `boards.shared_with_party`; party members can add a quest (`tasks.added_by`) or "Take this on too" (a plain copy, no link back). `src/lib/data/party.ts`. In use on 0 boards.
- **Victories share automatically:** `completeTask` (`src/lib/data/tasks.ts:523`) always inserts an `activity_events` row; `is_public` comes from the board's or profile's privacy. The Guild Hall feed (`listFeed`) shows them to friends.
- **XP:** `xp.awardXp(ownerId, amount, kind, taskId)` writes `xp_events`, splits into character stats (`tasks.stat_split`, edited with `StatSplitEditor`), pays coins, handles level-ups. `tasks.xp_awarded` records what a quest has paid, and undo reverses it.
- **Every list in the app filters `tasks.owner_id = me`** (Today, boards, calendar, matrix, auto-scheduler, Due soon). This is the fact the model below is built around.
- All access is server-side with the service role, so **permissions are enforced in the data layer**, not by RLS.

## 2. The core decision: one truth, a personal handle for each teammate

A shared quest could be (a) one row that many people "belong" to, or (b) a copy per person. (a) breaks every `owner_id = me` query and has nowhere to keep each person's own schedule, priority, board and snooze. (b) drifts apart. So:

- The quest stays **one row owned by the person who made it** (the **host**). That row and its `quest_steps` are the truth for everything the team shares.
- Each teammate who joins gets **their own `tasks` row, a "handle"**, with `shared_task_id` pointing at the host's row. The handle carries only personal things. Because it is an ordinary row they own, it shows up in their Today, boards, calendar and matrix with no change to those queries.
- Shared fields are **copied onto every handle whenever the host row changes** (one function, `syncHandles(hostTaskId)`), so cards render without joins. Writes to shared fields from a handle are **redirected to the host row** (`resolveHost(taskId)`), then synced out.
- A quest that isn't shared is untouched: no new rows, no new code paths.

| Shared (lives on the host row, copied to handles) | Personal (each row's own) |
|---|---|
| title, description, icon (`icon_key`, `icon_source`, `icon_prompt`) | board (`board_id`, `also_on`), tags, color |
| `due_at`, early bonus fields | `scheduled_start/end`, `is_on_calendar`, Google event id, `plan_by` |
| `status`, `completed_at`, `failed_at`, `fail_reason`, `progress` | `queued_for`, `queue_rank`, `in_additional`, `is_manual_priority`, `snoozed_until` |
| sub-quests (`quest_steps` of the host row; handles have none of their own) | importance, urgency, effort, interest and the other scales; `matrix_state` |
| the quest's total XP and coins (on the host row only, see section 4) | `xp_value` / `coin_value` on a handle = **that person's share**; `stat_split`; `xp_awarded`; `minutes_spent`; reward link |
| attachments | `is_tiny`, `estimate_minutes`, `reschedule_count` |

## 3. Tables

One table for every kind of sharing, because the owner's words are "a quest or a part of a quest or a board **or anything**". A new kind is then one more value, the same invite flow and the same permission check.

```sql
-- draft for supabase/migrations/NNNN_shares.sql (number it after the latest on main)
create table shares (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quest','step','board')),   -- later: 'habit','reward','goal'
  target_id uuid not null,              -- tasks.id (the host row) | quest_steps.id | boards.id
  task_id uuid references tasks(id) on delete cascade,   -- for quest and step: the host quest (so deletes cascade)
  board_id uuid references boards(id) on delete cascade, -- for board
  owner_id uuid not null references profiles(id) on delete cascade,   -- the host
  member_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'teammate' check (role in ('teammate','supporter')),
  status text not null default 'invited' check (status in ('invited','joined','declined','left')),
  split_pct numeric(5,2) check (split_pct is null or (split_pct >= 0 and split_pct <= 100)), -- quest/step, teammates only
  handle_task_id uuid references tasks(id) on delete set null,  -- the member's own row, made when they join
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (kind, target_id, member_id),
  check (owner_id <> member_id)
);
create index shares_member_idx on shares(member_id, status);
create index shares_target_idx on shares(kind, target_id);
alter table shares enable row level security;  -- no policies: server-only, like the other tables

alter table tasks add column shared_task_id uuid references tasks(id) on delete cascade; -- set on a handle
alter table tasks add column shared_step_id uuid references quest_steps(id) on delete cascade; -- handle for one part
alter table tasks add column share_mode text check (share_mode in ('together','each')); -- on the host row; null = not shared
create index tasks_shared_idx on tasks(shared_task_id) where shared_task_id is not null;

alter table quest_steps add column assignee_id uuid references profiles(id) on delete set null; -- null = anyone on the quest

alter table activity_events add column audience text not null default 'party' check (audience in ('party','team','none'));
alter table invite_links add column share_id uuid references shares(id) on delete set null; -- a link that also joins a quest/board
-- notifications_kind_check: add 'share_invite','share_joined','share_done','share_left'
```

- `boards.shared_with_party` stays as it is and means "everyone in my party can see and add". `shares` rows of kind `board` are for **named people** (a board with just Tiffany). No row is needed for the whole-party case.
- The host has no `shares` row. The host's share of XP is `100 − sum(joined teammates' split_pct)`.
- "My quest party" for a quest = host + rows with `status = 'joined'`.

## 4. XP, coins and splits

1. **A split divides, it never creates.** The host row's `xp_value` / `coin_value` are the quest's totals. Each joined teammate's handle gets `xp_value = total × split_pct`, the host keeps the rest. Round down for teammates; the host's share takes the remainder, so the parts always add up to the total. (Guards against the "gaming the system" problem in note 13b4b2d4.)
2. **Default split is even** across host and joined teammates. The host can change it. Supporters get no XP.
3. **Only people who have joined count.** An invited person's share stays with the host until they join; if someone leaves before completion their share returns to the host. Re-run `syncHandles` on every join, leave and split change.
4. **Paying out (Together mode):** when the quest completes, for the host row and each handle call the existing `awardXp(thatOwner, thatRowsShare, 'task_completed', thatRowId)` and set that row's `xp_awarded`. Each person's share then splits across *their own* character stats and pays *their own* coins and level-ups with no new code. **Pay only where `xp_awarded` is still 0** so an offline replay or double tap can't pay twice.
5. **Undo** reverses each row from its own `xp_awarded` (the existing path), for every row of the quest.
6. **Sub-quests:** a step with an `assignee_id` pays its `xp` to that person alone; an unassigned step pays by the quest's split. Step coins follow the same rule.
7. **Early bonus** follows the same percentages. **Rewards** (`reward_id`, `grants_reward`) stay personal: each person's own handle can carry their own treasure.

## 5. Who can do what

`src/lib/data/shares.ts` should export one check, `can(viewerId, action, kind, targetId)`, and every shared read or write goes through it. Roles are kept to three so the invite UI stays light.

| Action | Host | Teammate (joined) | Supporter (joined) | Invited, not yet joined | Rest of the host's party |
|---|---|---|---|---|---|
| See the quest, its sub-quests and progress | ✓ | ✓ | ✓ | title, host and their share only | only if not private and the host shares that screen (today's rule) |
| Cheer, comment | ✓ | ✓ | ✓ | – | as today, on the shared victory |
| Tick, add, edit, reorder sub-quests | ✓ | ✓ | – | – | – |
| Edit title, notes, due date, icon | ✓ | ✓ **(default, Q3)** | – | – | – |
| Complete or fail the quest | ✓ | ✓ | – | – | – |
| Change total XP/coins, the split, the mode | ✓ | – | – | – | – |
| Invite or remove people | ✓ | – (can leave) | – (can leave) | can decline | – |
| Delete the quest | ✓ | – | – | – | – |
| Their own schedule, board, priority, snooze, privacy of their handle | ✓ | ✓ | ✓ (a supporter's handle is optional, see 6) | – | – |

**Visibility rules (the part that is easy to get wrong):**

1. **An explicit share beats "private".** Marking a shared quest private hides it from party-wide places (friend's page, feed) but never from its own quest party.
2. **A teammate's friends don't inherit access.** When deciding whether viewer V may see a handle on member M's shared screens, evaluate V against the **host** quest: V must be the host, a joined member, or in the *host's* party with the host quest not private. One function, `viewerCanSeeTask`, replaces the scattered `is_private` checks for rows with `shared_task_id`.
3. **Teammates see each other on that quest only** (name, avatar, what they did on it), even if they aren't friends with each other.
4. **Unfriending ends every share between the two people** (status `left`, handles removed). XP already paid stays.
5. **Board members** (kind `board`) see the board's non-private quests, can add quests (`added_by`, as today) and can ask to join one. Being on a board does not put you on its quests or in their XP.

**Lifecycle:**

- Invite → `shares` row `invited` + a `share_invite` notification (and email by `notify_level`). Nothing appears in the invitee's lists yet.
- Join → status `joined`, create the handle (in their Additional Quests, `in_additional = true`, no schedule), `syncHandles`, notify the host.
- Not now → `declined`; the host can invite again later.
- Leave or removed → `left`; delete the handle if the quest is still open (keep it, detached, if already completed so history and XP stay).
- Host deletes the quest → cascade removes open handles; teammates get one notification.
- Quest completed → every row completes and is paid (section 4); teammates get `share_done` and see it among their own victories.

## 6. The two modes

- **Together** (first to build, the default): one quest, one completion, XP split. Everything above.
- **Each their own:** the same quest for each person, done separately (the gym, a reading challenge). Each handle has its own status and its own copies of the sub-quests, each person earns the full XP, and the link (`shared_task_id`) is used only to show one another's progress and to cheer. This is today's "Take this on too" plus the link. No split, no redirect of writes.
- **Supporter** on either mode: sees progress, gets told when it's done, can cheer and comment, earns nothing. Gets no handle unless they ask to "keep it on my Today".

## 7. Sharing each victory (notes 6d473d8d, f8e7f00a)

- Completion still writes the `activity_events` row (the owner's own history needs it), but with **`audience` set by the owner's choice on the celebration screen**, not automatically.
- On `celebration/QuestComplete.tsx`: one `GoldCheck` line, "Share with my party". It remembers the last choice (`readExtras`, merged into `profiles.life_wheel`), starts on **(default, Q4)**, and is absent for private quests. The feed row is published **when the celebration is closed / the reward claimed**, so an undo in the first seconds never reaches anyone.
- `listFeed` shows `audience = 'party'` to friends, `'team'` to the quest party only, `'none'` to nobody. A Together quest always reaches its own quest party; the check controls only the wider party.
- One feed row per Together quest, naming everyone ("Peace General and Daniel finished …"), not one per person. Show the XP as "+25 XP" (note 89c05f2c).
- Settings › Sharing gets the same choice as a standing setting: Ask each time / Always / Never.
- This part is independent of the rest and can be built first.

## 8. Screens, in the app's existing parts (for the design review, not final)

- **Quest editor:** a `.qe-fact` pill "With" (flat line icon of two figures) that opens a `.qe-fact-panel` in place: the party as avatar chips to tap on and off, a Together / Each their own pick, and under it one row per person with their share, built like `StatSplitEditor`. No popup.
- **Quest ⋯ menu and right-click:** "Invite a friend" opens the same panel.
- **Sub-quest ⋯ menu:** "Ask a friend" (invites to just that part, sets `assignee_id`).
- **Board editor:** the same "With" pill, with "Everyone in my party" as the first chip (the existing switch).
- **Quest cards:** small overlapping avatars at the card's edge; a handle reads "with Tiffany" in the soft ink line. A part-only handle reads "part of *Tiffany's birthday*".
- **Invites:** a row in notifications with Join and Not now inline, and a short "Invited" drawer at the top of the Guild Hall.
- **Someone not in the app:** the existing invite writer (`social/InviteComposer`), with the link carrying the share so accepting lands them in the party and on the quest.
- Add every new state to `scripts/ui-check/flows.mjs` (the fake database needs a second profile and a friendship).

## 9. Questions for the owner (asked Nov 16; record answers here)

1. **Together or each their own?** Default: both exist; Together is built first and is what "invite a friend" does unless you switch it.
2. **What a split means.** Default: it divides the quest's XP and coins (100 XP at 60/40 pays 60 and 40), starting even.
3. **What a teammate may change.** Default: tick and add sub-quests, edit the title, notes and due date, and complete it; only the host changes XP, the split, who's on it, or deletes it. Plus a "supporter" who watches and cheers and earns nothing.
4. **The victory check.** Default: "Share with my party" on the celebration screen, starts on, remembers your last choice, sent when you claim the reward.
5. **Do invites need accepting?** Default: yes, Join / Not now, and nothing lands in their lists until they join.
6. **One party, or named teams?** Default: one party; you pick people per quest or board. Named teams (Family, Openthink) later if wanted. Words: "party" for all your friends, "quest party" for the people on one quest.
7. **Friends of friends.** Default: a teammate's friends can't see a shared quest unless they are in your party too.

## 10. Build order (each step is its own review branch)

1. **Victory check** (section 7). Small; touches `completeTask`, `activity.ts`, `QuestComplete.tsx`, Settings › Sharing. Needs Q4.
2. **Shares table, data layer and Together quests:** migration, `src/lib/data/shares.ts` (`can`, `invite`, `respond`, `leave`, `syncHandles`, `resolveHost`, `viewerCanSeeTask`), the "With" panel with an even split, invite notifications, Join / Not now, handles, completion and undo paying every row. Needs Q1, Q2, Q3, Q5, Q7. **Write tests for the split math and the pay-once guard** (rounding sums to the total; replayed completion pays nothing; undo returns every row to zero).
3. **Changing the split; sub-quest invites and assignees.**
4. **Boards with named people;** "Join" beside "Take this on too" on shared boards.
5. **Each their own mode; supporters' progress view.**
6. Later, each needing its own short design: habits shared (each their own, with a shared streak), proposing a time to the quest party with yes / maybe / no (note ed77d378), a comment thread per shared quest (`social/CommentThread`), invite links that carry a share, shared rewards.

**Traps for whoever builds this:**
- Server actions that update a quest filter on `owner_id`; on a handle they would silently edit only the copy. Route shared fields through `resolveHost` and personal fields to the handle. Go through `actions.ts` update paths one by one (edit, progress, complete, undo, fail, archive, delete, step actions at ~4521).
- Step actions key on `quest_steps.owner_id`; a teammate ticking a step must pass `can()` and then write as the host's step.
- The offline queue can replay a completion; the `xp_awarded` guard in section 4 is what keeps that safe.
- `listWinsSince`, `partyWeek` and the weekly XP count read `xp_events`/tasks per owner; with handles they stay correct with no change. Don't "fix" them to count the host row for teammates.
- The auto-scheduler and Google Calendar placement act on the row they are given; handles keep those personal, so nothing is ever written to a teammate's calendar.
- Bulk tools (import, archive all, move due dates) should skip or ask on rows with `shared_task_id` or `share_mode`.

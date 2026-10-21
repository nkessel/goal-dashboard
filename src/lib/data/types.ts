export type Board = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  color: string | null;
  is_private: boolean;
  /** Visible to your party, who can add quests and take them on. */
  shared_with_party?: boolean;
  sort_order: number;
  /** Null for a top-level board; another board's id for a nested sub-board. */
  parent_board_id: string | null;
  /** On the Priority Matrix as one item: 'plot' (map), 'unplotted', 'later'; null = not on it. */
  matrix_state?: "plot" | "unplotted" | "later" | null;
  /** The project's chosen next action (a quest on this board). */
  next_task_id?: string | null;
  importance?: number;
  urgency?: number;
  effort?: number;
  icon_key?: string | null;
  icon_source?: "library" | "ai" | null;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  board_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  progress: number;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type Task = {
  id: string;
  owner_id: string;
  goal_id: string | null;
  title: string;
  description: string | null;
  importance: number;
  urgency: number;
  /** Minutes the task is expected to take (the "⏱ 25m" row on the card).
   * Null when no estimate was given. */
  estimate_minutes: number | null;
  reschedule_count: number;
  color: string | null;
  icon_key: string | null;
  icon_source: "monster" | "library" | "ai";
  xp_value: number;
  is_on_calendar: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  google_calendar_event_id: string | null;
  is_manual_priority: boolean;
  status: "open" | "completed";
  /** Set on a secret-mission step (hidden until sent to Today). */
  mission_id?: string | null;
  completed_at: string | null;
  /** When the completion was recorded (may be later than completed_at). */
  logged_at?: string | null;
  /** The level boss this quest counts toward, if any. */
  boss_id?: string | null;
  /** Place on the scheduling priority list (null = not on it). */
  schedule_rank?: number | null;
  schedule_folder?: string | null;
  /** Percent of this quest's XP sent to each character stat. */
  stat_split?: Record<string, number> | null;
  /** Tags for sorting quests across boards (life wheel, insights). */
  tags?: string[] | null;
  /** A stand-in quest: it speaks for this board's current assignment. */
  stands_for?: string | null;
  /** Filled in for a stand-in: the assignment it points at right now. */
  stand_in?: { id: string; title: string; due_at: string | null; next_step: string | null; board: string | null } | null;
  /** Hidden from your party, even on screens you share. */
  is_private?: boolean;
  /** A party member who added this quest to a shared board. */
  added_by?: string | null;
  created_at: string;
  updated_at: string;
  reminder_sent_at: string | null;
  /** Completing this quest lets you pick one of your rewards. */
  grants_reward?: boolean;
  /** Imported (e.g. by Claude) and not yet confirmed in the review flow. */
  needs_review?: boolean;
  /** Prompt for an auto-generated portrait, made during review. */
  icon_prompt?: string | null;
  /** 0–100: how far along the quest is (partial progress earns partial XP). */
  progress?: number;
  /** XP already paid out for this quest (partial progress and/or completion). */
  xp_awarded?: number;
  /** This quest is the reward itself (created when the reward was accepted). */
  reward_id?: string | null;
  /** Hidden behind this (prerequisite) quest until it's completed. */
  locked_by_task_id?: string | null;
  /** A quick-win, low-energy quest kept in the Power-ups menu. */
  is_power_up?: boolean;
  /** The quest board this quest belongs to (null = no board). */
  board_id?: string | null;
  /** Other boards it also shows on (linked there, still living on board_id). */
  also_on?: string[] | null;
  /** On a board it's linked to: the name of the board it lives on. */
  home_board_title?: string | null;
  /** 0–5: how much energy it takes (0 = unrated). */
  effort?: number;
  /** Kept in view on its board, but not actionable yet (off Today, the map and Power-ups). */
  is_aspiration?: boolean;
  /** A deadline (separate from a calendar slot). */
  due_at?: string | null;
  /** Planned for this day in the evening routine (moves into Today's Quests then). */
  queued_for?: string | null;
  /** False = not listed in Additional Quests (lives on its board only). */
  in_additional?: boolean;
  queue_rank?: number | null;
  /** Tomorrow's planned order of doing (see queue_rank for importance). */
  queue_seq?: number | null;
  /** Spark map ratings, 0–5 (null = not rated yet). */
  interest?: number | null;
  novelty?: number | null;
  challenge?: number | null;
  /** 0–5: how much energy finishing it gives back (0 = unrated). */
  energy_gain?: number | null;
  /** The first step still to do (when loaded). */
  next_step?: string | null;
  /** Can be worked on in chunks of this many minutes (filler time). */
  chunk_minutes?: number | null;
  /** Custom coin payout; null = automatic from XP. */
  coin_value?: number | null;
  /** Matrix screen placement: 'unplotted' / 'later' lots, or 'hidden' (off the matrix). */
  matrix_state?: "unplotted" | "later" | "hidden" | null;
  /** Step checklist counts, attached when listed for a card (not a column). */
  steps_total?: number;
  steps_done?: number;
};

export type Profile = {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  avatar_base: string;
  avatar_color: string;
  avatar_accessory: string | null;
  avatar_image_url: string | null;
  theme: "calm" | "adventure";
  level: number;
  total_xp: number;
  /** Spendable on rewards; earned with XP (see lib/coins). Missing before migration 0013. */
  coins?: number;
  weekly_xp_budget: number;
  streak_count: number;
  streak_protection_tokens: number;
  last_check_in_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  /** Character stats, in the owner's order (null = the defaults). */
  stats?: string[] | null;
  /** XP earned in each stat. */
  stat_xp?: Record<string, number> | null;
  /** An honorary level (1–99) shown instead of the earned one, when granted. */
  display_level?: number | null;
  /** Which screens your party can see. */
  share_settings?: Record<string, boolean> | null;
  notify_level?: "all" | "highlights" | "essential";
  notify_email?: boolean;
  /** Health, in half-hearts (0–10). */
  hp?: number;
  /** The toucan spirit's add-ons: owned, and worn per slot. */
  toucan?: { owned?: string[]; equipped?: Record<string, string> } | null;
  /** The life wheel's areas (Insights). */
  life_wheel?: { topics?: string[]; streaks?: import("@/lib/streaks").StreakDef[]; inventory?: import("@/lib/inventory").Inventory; weather?: { lat: number; lon: number; name?: string | null } } | null;
  /** Private long quests with steps (see lib/missions). */
  secret_missions?: unknown;
};

/** A shared avatar image — either one of the built-in presets or one a user
 * generated (every generated avatar is added here automatically, so the
 * whole library grows as people use it). */
export type AvatarLibraryEntry = {
  id: string;
  image_url: string;
  created_by: string | null;
  prompt: string | null;
  is_preset: boolean;
  created_at: string;
};

/** A shared quest/task icon — either a built-in preset or one a user
 * generated (every generated task icon is added here automatically, so the
 * whole library grows as people use it). Mirrors AvatarLibraryEntry but
 * scoped to task icons, which use their own generation prompt style. */
export type Reward = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  icon_key: string | null;
  icon_prompt: string | null;
  /** claimed = accepted (coins spent); completed = done (bonus paid). */
  status: "available" | "claimed" | "completed";
  completed_at?: string | null;
  claimed_at: string | null;
  claimed_with_task_id: string | null;
  needs_review: boolean;
  /** Price in coins (0 = free). */
  cost_coins?: number;
  /** Coins paid when claimed (refunded if put back). */
  coins_spent?: number | null;
  /** Completion bonus granted when completed (reversed if undone). */
  bonus_xp?: number;
  bonus_coins?: number;
  /** Optional quest that must be done before the reward is revealed. */
  prereq_title?: string | null;
  prereq_description?: string | null;
  prereq_xp?: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaskIconLibraryEntry = {
  id: string;
  image_url: string;
  created_by: string | null;
  prompt: string | null;
  is_preset: boolean;
  created_at: string;
  /** Which shelf it sits on in the picker. */
  category?: "quest" | "reward" | "character";
};

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
};

export type InviteLink = {
  id: string;
  created_by: string;
  code: string;
  uses_count: number;
  created_at: string;
  expires_at: string | null;
};

export type ActivityKind = "task_completed" | "goal_completed" | "level_up";

export type ActivityEvent = {
  id: string;
  owner_id: string;
  kind: ActivityKind;
  task_id: string | null;
  goal_id: string | null;
  is_public: boolean;
  created_at: string;
};

export type ActivityReaction = {
  id: string;
  activity_id: string;
  profile_id: string;
  emoji: string;
  created_at: string;
};

export type ActivityComment = {
  id: string;
  activity_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type NotificationKind =
  | "friend_request"
  | "friend_request_accepted"
  | "reaction"
  | "comment"
  | "reschedule_reminder"
  | "level_up"
  | "daily_check_in"
  | "imports"
  | "feedback"
  | "support"
  | "shared_board";

export type AppNotification = {
  id: string;
  profile_id: string;
  actor_id: string | null;
  kind: NotificationKind;
  activity_id: string | null;
  task_id: string | null;
  friendship_id: string | null;
  body: string;
  is_read: boolean;
  email_sent: boolean;
  created_at: string;
  /** Hidden until then, when it comes back unread. */
  snoozed_until?: string | null;
};

export type XpEventKind =
  | "task_assigned"
  | "task_completed"
  | "daily_check_in"
  | "streak_bonus"
  | "level_up_adjustment";

export type XpEvent = {
  id: string;
  owner_id: string;
  task_id: string | null;
  kind: XpEventKind;
  amount: number;
  week_start: string;
  created_at: string;
};

export type Board = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  color: string | null;
  is_private: boolean;
  sort_order: number;
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
  reschedule_count: number;
  color: string | null;
  icon_key: string | null;
  icon_source: "monster" | "library";
  xp_value: number;
  is_on_calendar: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  google_calendar_event_id: string | null;
  is_manual_priority: boolean;
  status: "open" | "completed";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  reminder_sent_at: string | null;
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
  theme: "calm" | "adventure";
  level: number;
  total_xp: number;
  weekly_xp_budget: number;
  streak_count: number;
  streak_protection_tokens: number;
  last_check_in_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
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
  | "daily_check_in";

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

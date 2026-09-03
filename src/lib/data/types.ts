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
};

/**
 * Settings kept in each browser that the app's owner can make the default for
 * every account. Only looks, layouts and views: never drafts, positions,
 * places, calendars or anything else personal.
 */
export const SHAREABLE_SETTINGS: { key: string; label: string }[] = [
  { key: "goalFxSaved", label: "Celebrations and effects" },
  { key: "visual-fx", label: "Visual effects" },
  { key: "quest-editor-layout", label: "The quest editor" },
  { key: "quest-menu-layout", label: "Quest ⋯ menu" },
  { key: "menu-layouts", label: "Layout: habit editor and menus" },
  { key: "settings-order", label: "Settings order" },
  { key: "settings-tiles-order", label: "Settings tiles order" },
  { key: "habits-header-look", label: "Daily Habits header" },
  { key: "habits-header-mark", label: "Daily Habits mark" },
  { key: "party-view", label: "What the Guild Hall shows" },
  { key: "evening-mode", label: "Evening mode" },
  { key: "evening-low-light", label: "Evening low light" },
  { key: "toucan-flourish", label: "Toucan flourish" },
  { key: "toucan-talk-look", label: "Toucan's speech" },
  { key: "toucan-mode", label: "Toucan mode" },
  { key: "portrait-library-shown", label: "Portrait library" },
  { key: "insights-view-2", label: "Tracking chart view" },
  { key: "insights-shown", label: "Tracking chart lines" },
  { key: "insights-xp-view-2", label: "XP per day view" },
  { key: "priority-view", label: "Priority view" },
  { key: "matrix-mode", label: "Matrix mode" },
  { key: "checkin-expanded", label: "Check-in opened" },
  { key: "calendar-hour-px", label: "Calendar zoom" },
  { key: "planner-hour-px", label: "Planner zoom" },
];
export const SHAREABLE_KEYS = new Set(SHAREABLE_SETTINGS.map((s) => s.key));

-- App-wide defaults for settings kept on each device (looks, layouts, views).
-- The app's owner sets them from Settings ("Set as default for all accounts");
-- a device that hasn't chosen a setting itself starts from the default.
create table if not exists app_defaults (
  key text primary key,
  value text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table app_defaults enable row level security;

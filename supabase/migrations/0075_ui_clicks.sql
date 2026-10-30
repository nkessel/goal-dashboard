-- Every tap and click in the app (what was pressed, where, and how long since the last one),
-- for the UX design teams to see where the app is slow or confusing. Server-only (RLS on, no policies).
create table if not exists ui_clicks (
  id bigserial primary key,
  owner_id uuid not null references profiles(id) on delete cascade,
  at timestamptz not null,
  path text not null,
  label text not null,
  kind text,
  gap_ms integer,
  device text
);
create index if not exists ui_clicks_owner_at on ui_clicks (owner_id, at desc);
alter table ui_clicks enable row level security;

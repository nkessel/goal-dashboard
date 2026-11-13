-- Messages between party members (owner, Nov 13: "let me send in-app messages to my friends").
-- Read and written only by the server (service role); RLS on, no policies.
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_pair_idx on direct_messages (least(from_id, to_id), greatest(from_id, to_id), created_at desc);
create index if not exists direct_messages_unread_idx on direct_messages (to_id) where read_at is null;
alter table direct_messages enable row level security;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind = any (array['friend_request','friend_request_accepted','reaction','comment','reschedule_reminder','level_up','daily_check_in','imports','feedback','support','shared_board','message']));

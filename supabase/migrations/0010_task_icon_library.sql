-- Shared quest/task icon library — mirrors avatar_library (0009) but scoped
-- to task icons instead of character avatars. Every AI-generated task icon
-- gets added here (with its prompt kept as searchable metadata) so anyone
-- can browse and re-pick a previously generated icon instead of only ever
-- generating a fresh one. Replaces the old emoji/monster-emoji picker in the
-- UI entirely — task icons are AI-generated images only now.

create table if not exists task_icon_library (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  -- Null for the built-in presets seeded below (and for any row whose
  -- creator's account is later deleted).
  created_by uuid references profiles(id) on delete set null,
  prompt text,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-generating the same prompt shouldn't pile up duplicate library rows.
create unique index if not exists task_icon_library_image_url_key on task_icon_library (image_url);

-- Everyone can browse the whole library (it's meant to be shared); only the
-- server (via the service-role key) inserts into it, so no insert policy is
-- needed for the anon/authenticated roles.
alter table task_icon_library enable row level security;
drop policy if exists "Task icon library is publicly readable" on task_icon_library;
create policy "Task icon library is publicly readable" on task_icon_library for select using (true);

-- The same 8 pre-made monster portraits already bundled in /public/design
-- (and already seeded as avatar presets in 0009) so the library isn't empty
-- before anyone has generated their own task icons.
insert into task_icon_library (image_url, is_preset, prompt) values
  ('/design/icon-dragon.jpg', true, 'dragon'),
  ('/design/icon-goblin.jpg', true, 'goblin'),
  ('/design/icon-sorcerer.jpg', true, 'sorcerer'),
  ('/design/icon-boar.jpg', true, 'boar'),
  ('/design/icon-golem.jpg', true, 'golem'),
  ('/design/icon-venomroot.jpg', true, 'venomroot'),
  ('/design/icon-bat.jpg', true, 'bat')
on conflict (image_url) do nothing;

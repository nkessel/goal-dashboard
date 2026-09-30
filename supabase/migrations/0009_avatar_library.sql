create table if not exists avatar_library (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  created_by uuid references profiles(id) on delete set null,
  prompt text,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists avatar_library_image_url_key on avatar_library (image_url);

alter table avatar_library enable row level security;
drop policy if exists "Avatar library is publicly readable" on avatar_library;
create policy "Avatar library is publicly readable" on avatar_library for select using (true);

insert into avatar_library (image_url, is_preset, prompt) values
  ('/design/icon-dragon.jpg', true, 'dragon'),
  ('/design/icon-goblin.jpg', true, 'goblin'),
  ('/design/icon-sorcerer.jpg', true, 'sorcerer'),
  ('/design/icon-boar.jpg', true, 'boar'),
  ('/design/icon-golem.jpg', true, 'golem'),
  ('/design/icon-venomroot.jpg', true, 'venomroot'),
  ('/design/icon-bat.jpg', true, 'bat'),
  ('/design/avatar-ranger.jpg', true, 'ranger')
on conflict (image_url) do nothing;

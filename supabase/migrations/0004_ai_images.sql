-- AI-generated avatars/quest icons. Generated once via Cloudflare Workers AI,
-- then the PNG is uploaded to Supabase Storage and its public URL is stored
-- here — never regenerated on every view (per product decision).

alter table profiles add column if not exists avatar_image_url text;

alter table tasks drop constraint if exists tasks_icon_source_check;
alter table tasks add constraint tasks_icon_source_check
  check (icon_source in ('monster', 'library', 'ai'));

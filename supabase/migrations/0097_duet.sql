-- Duet: lets the owner's Claude (in another app, through the Supabase connector) add, edit, prioritize,
-- reorder and complete quests, habits and boards by calling public.duet(action, args). The function posts to
-- the app's /api/duet route, which runs the app's own logic. See docs/DUET.md. Off until secret.duet_key is set.

-- What each change did, so `undo` can put it back. Service role only (RLS on, no policies), like the other server tables.
create table if not exists public.duet_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  action text not null,
  args jsonb,
  target_kind text,
  target_id uuid,
  before jsonb,
  after jsonb,
  undone_at timestamptz
);
create index if not exists duet_changes_owner_at_idx on public.duet_changes(owner_id, at desc);
alter table public.duet_changes enable row level security;
revoke all on public.duet_changes from anon, authenticated;

create extension if not exists http with schema extensions;

create or replace function public.duet(action text, args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  resp extensions.http_response;
  body jsonb;
begin
  select value into v_url from public.app_defaults where key = 'secret.duet_url';
  select value into v_key from public.app_defaults where key = 'secret.duet_key';
  if v_url is null or v_key is null or v_key = '' then
    return jsonb_build_object('ok', false, 'error', 'Duet is switched off (secret.duet_url or secret.duet_key is not set).');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '25');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');
  begin
    resp := extensions.http((
      'POST', v_url,
      array[extensions.http_header('x-duet-key', v_key)],
      'application/json',
      jsonb_build_object('action', action, 'args', coalesce(args, '{}'::jsonb))::text
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Could not reach the app: ' || replace(sqlerrm, v_key, '***'));
  end;
  begin
    body := resp.content::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'http_status', resp.status, 'error', 'The app answered with something that was not JSON.');
  end;
  if resp.status <> 200 and jsonb_typeof(body) = 'object' then
    body := body || jsonb_build_object('ok', false, 'http_status', resp.status);
  end if;
  return body;
end;
$$;

revoke all on function public.duet(text, jsonb) from public, anon, authenticated;
grant execute on function public.duet(text, jsonb) to service_role, postgres;

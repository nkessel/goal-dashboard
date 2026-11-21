-- D0 (split plan): write ONE key of profiles.life_wheel atomically, so two saves of different keys
-- close together can no longer overwrite each other with a stale copy. A null value removes the key.
-- Service role only (the app's server actions call it through supabaseAdmin()).
create or replace function set_profile_extra(p_owner uuid, p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    update profiles set life_wheel = coalesce(life_wheel, '{}'::jsonb) - p_key where id = p_owner;
  else
    update profiles set life_wheel = coalesce(life_wheel, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = p_owner;
  end if;
end $$;

revoke all on function set_profile_extra(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function set_profile_extra(uuid, text, jsonb) to service_role;

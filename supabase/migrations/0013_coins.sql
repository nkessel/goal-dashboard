-- Coins: earned at 1 per 10 XP (rounded up, per award) and spent on rewards.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'coins') then
    alter table profiles add column coins integer not null default 0;
    -- Starting purse for XP earned before coins existed.
    update profiles set coins = ceil(total_xp / 10.0)::int where total_xp > 0;
  end if;
end $$;

alter table rewards add column if not exists cost_coins integer not null default 0;
-- What was actually paid when claimed, so "put back" refunds exactly that.
alter table rewards add column if not exists coins_spent integer;

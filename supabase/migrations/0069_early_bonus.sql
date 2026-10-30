-- Early bonus: XP you set yourself for finishing a quest before it's due.
-- null = the automatic early-bird bonus (half its XP, 2+ days early); 0 = none.
alter table public.tasks add column if not exists early_bonus_xp integer;

-- Run B step D1 (docs/plans/2026-11-16-split-plan.md): real columns for per-quest extras that live in
-- profiles.life_wheel keys today (questPlaces, calCardLooks, progressUnits). Nothing reads them yet.
alter table public.tasks
  add column if not exists place text,
  add column if not exists card_look jsonb,
  add column if not exists progress_unit jsonb;

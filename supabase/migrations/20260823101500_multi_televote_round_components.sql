alter table public.results
  add column if not exists televote_components jsonb not null default '[]'::jsonb;

comment on column public.results.televote_components is
  'Optional per-round public-vote breakdown. Each item stores round_id, label, points and optional raw_votes/percentage. The legacy televote_points column remains the combined public-vote contribution used by analytics and scoreboards.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_televote_components_array_chk'
  ) then
    alter table public.results
      add constraint results_televote_components_array_chk
      check (jsonb_typeof(televote_components) = 'array');
  end if;
end
$$;

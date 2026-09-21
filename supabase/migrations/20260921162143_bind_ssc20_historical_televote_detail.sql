insert into public.televoting_round_bindings (
  remote_round_id,
  remote_edition_id,
  edition_id,
  show_id,
  source_mode,
  last_synced_at,
  frozen_at,
  updated_at
)
select
  tr.id::text,
  te.id::text,
  e.id,
  s.id,
  'show',
  null,
  now(),
  now()
from public.editions e
join public.shows s
  on s.edition_id = e.id
 and s.kind in ('grand-final', 'final')
join televoting.editions te
  on te.name = 'Solaris Song Contest 20'
join televoting.rounds tr
  on tr.edition_id = te.id
 and tr.name = 'Grand Final'
where e.edition_number = 20
  and exists (
    select 1
    from televoting.round_results rr
    where rr.round_id = tr.id
      and jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object'
      and rr.calculation_config -> 'country_contributions' <> '{}'::jsonb
  )
on conflict (remote_round_id) do update
set
  remote_edition_id = excluded.remote_edition_id,
  edition_id = excluded.edition_id,
  show_id = excluded.show_id,
  source_mode = excluded.source_mode,
  frozen_at = coalesce(public.televoting_round_bindings.frozen_at, excluded.frozen_at),
  updated_at = excluded.updated_at;

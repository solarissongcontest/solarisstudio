begin;

-- A linked Robust Televote v2 round already contains ballot softening,
-- support-breadth protection and the bounded rank boost. Feeding its raw
-- ballot totals back through the legacy raw-results converter would erase
-- those protections. Linked robust rounds therefore enter a combined result
-- as converted points and are proportionally rescaled into their component
-- pool. External/manual raw sources remain free to use rank_weighted input.
create or replace function televoting.enforce_robust_round_combined_input()
returns trigger
language plpgsql
set search_path = televoting, pg_temp
as $$
declare
  v_engine text;
begin
  if new.source_round_id is null then
    return new;
  end if;

  select r.televote_engine_version into v_engine
  from televoting.rounds r
  where r.id = new.source_round_id;

  if v_engine = 'robust-televote-v2' then
    new.input_mode := 'converted_points';
    new.calculation_method := 'rescaled';
    new.calculation_stage := 'pre_conversion';
  end if;

  return new;
end $$;

drop trigger if exists televoting_aggregation_source_robust_input on televoting.televote_aggregation_sources;
create trigger televoting_aggregation_source_robust_input
before insert or update of source_round_id, input_mode, calculation_method
on televoting.televote_aggregation_sources
for each row execute function televoting.enforce_robust_round_combined_input();

update televoting.televote_aggregation_sources source
set input_mode = 'converted_points',
    calculation_method = 'rescaled',
    calculation_stage = 'pre_conversion',
    updated_at = now()
from televoting.rounds round
where source.source_round_id = round.id
  and round.televote_engine_version = 'robust-televote-v2'
  and (source.input_mode is distinct from 'converted_points'
       or source.calculation_method is distinct from 'rescaled');

commit;

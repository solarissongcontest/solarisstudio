begin;

-- System V3 Results -> qualification projection convergence.
--
-- public.results.final_rank remains the canonical positive qualification source.
-- The complete semi-final participant set defines which edition identities must
-- be reconciled, so an inactive participant or a participant with no canonical
-- ranked semi-final result cannot retain stale qualified=true state.
--
-- Canonical Results considers only confirmed participants competing. Historical
-- NULL participation_status is treated as confirmed for backward compatibility.
--
-- Direct finalists that never had a semi-final participant row remain outside
-- this projection and are therefore intentionally untouched.

select public.v3_register_migration_contract(
  'v3.results.qualification-convergence',
  1,
  'forward_fix_only',
  false,
  null,
  'Converge edition qualification from the complete semi-final participant set and canonical result ranks whenever Results or participation status changes.'
);

create or replace function public.refresh_edition_qualifications(_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with semi_participants as (
    select
      participant.country_id,
      case
        when participant.country_id is null
          then participant.contest_entity_id
        else null
      end as custom_entity_id,
      participant.show_id,
      coalesce(participant.participation_status, 'confirmed') = 'confirmed' as eligible,
      coalesce(
        case
          when (show_row.voting_config ->> 'qualifiers') ~ '^[0-9]+$'
            then (show_row.voting_config ->> 'qualifiers')::integer
          else null
        end,
        show_row.qualifier_count,
        0
      ) as cutoff
    from public.participants participant
    join public.shows show_row
      on show_row.id = participant.show_id
    where participant.edition_id = _edition_id
      and show_row.kind = 'semi-final'
  ),
  outcomes as (
    select
      semi_participant.country_id,
      semi_participant.custom_entity_id,
      coalesce(
        bool_or(
          semi_participant.eligible
          and semi_participant.cutoff > 0
          and result_row.final_rank between 1 and semi_participant.cutoff
        ),
        false
      ) as qualified
    from semi_participants semi_participant
    left join public.results result_row
      on result_row.show_id = semi_participant.show_id
     and (
       (
         semi_participant.country_id is not null
         and result_row.country_id = semi_participant.country_id
       )
       or
       (
         semi_participant.country_id is null
         and semi_participant.custom_entity_id is not null
         and result_row.country_id is null
         and result_row.contest_entity_id = semi_participant.custom_entity_id
       )
     )
    group by
      semi_participant.country_id,
      semi_participant.custom_entity_id
  )
  update public.participants participant
  set qualified = outcome.qualified
  from outcomes outcome
  where participant.edition_id = _edition_id
    and (
      (
        outcome.country_id is not null
        and participant.country_id = outcome.country_id
      )
      or
      (
        outcome.country_id is null
        and outcome.custom_entity_id is not null
        and participant.country_id is null
        and participant.contest_entity_id = outcome.custom_entity_id
      )
    )
    and participant.qualified is distinct from outcome.qualified;
end;
$$;

create or replace function private.v3_refresh_qualifications_after_result_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $refresh$
begin
  perform public.refresh_edition_qualifications(new.edition_id);
  return new;
end
$refresh$;

revoke all on function private.v3_refresh_qualifications_after_result_version()
  from public, anon, authenticated;

drop trigger if exists v3_result_version_refresh_qualifications
  on public.studio2_result_operations;

create trigger v3_result_version_refresh_qualifications
after update of calculation_version on public.studio2_result_operations
for each row
when (new.calculation_version > old.calculation_version)
execute function private.v3_refresh_qualifications_after_result_version();

-- Participation lifecycle is part of qualification eligibility.
--
-- participants_sync_results runs before this V3 trigger for the same UPDATE,
-- so canonical Results have already been reranked when qualification is
-- projected again.
--
-- A withdrawal/disqualification/non-competing status after Results calculation
-- must immediately remove stale qualification. Re-confirming a participant must
-- likewise re-project qualification from the canonical reranked result rather
-- than requiring another Results operation merely to repair derived state.

create or replace function private.v3_refresh_qualifications_after_participation_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $refresh$
begin
  if new.edition_id is not null then
    perform public.refresh_edition_qualifications(new.edition_id);
  end if;

  if old.edition_id is distinct from new.edition_id
     and old.edition_id is not null then
    perform public.refresh_edition_qualifications(old.edition_id);
  end if;

  return new;
end
$refresh$;

revoke all on function private.v3_refresh_qualifications_after_participation_status()
  from public, anon, authenticated;

drop trigger if exists v3_participation_status_refresh_qualifications
  on public.participants;

create trigger v3_participation_status_refresh_qualifications
after update of participation_status on public.participants
for each row
when (
  old.participation_status is distinct from new.participation_status
)
execute function private.v3_refresh_qualifications_after_participation_status();

-- Repair every edition that owns a semi-final, including editions where a stale
-- qualified participant has no remaining ranked Results row.
--
-- Direct finalists without a semi-final participant row remain untouched by
-- this projection.

do $backfill$
declare
  v_edition_id uuid;
begin
  for v_edition_id in
    select distinct show_row.edition_id
    from public.shows show_row
    where show_row.kind = 'semi-final'
  loop
    perform public.refresh_edition_qualifications(v_edition_id);
  end loop;
end
$backfill$;

notify pgrst, 'reload schema';

commit;
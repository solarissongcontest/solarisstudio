begin;

select public.v3_register_migration_contract(
  'v3.results.qualification-null-rank-reset',
  1,
  'forward_fix_only',
  false,
  null,
  'Make semifinal qualification a total projection over semifinal participant identities so unranked results cannot retain stale qualified=true state.'
);

create or replace function public.refresh_edition_qualifications(
  _edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $refresh$
begin
  with semi_rows as (
    select
      participant.country_id,
      case
        when participant.country_id is null
          then participant.contest_entity_id
        else null
      end as custom_entity_id,
      coalesce(
        case
          when (show_row.voting_config ->> 'qualifiers') ~ '^[0-9]+$'
            then (show_row.voting_config ->> 'qualifiers')::integer
          else null
        end,
        show_row.qualifier_count,
        0
      ) as cutoff,
      result_row.final_rank
    from public.participants participant
    join public.shows show_row
      on show_row.id = participant.show_id
     and show_row.edition_id = _edition_id
     and show_row.kind = 'semi-final'
    left join public.results result_row
      on result_row.show_id = participant.show_id
     and (
       (
         participant.country_id is not null
         and result_row.country_id = participant.country_id
       )
       or
       (
         participant.country_id is null
         and participant.contest_entity_id is not null
         and result_row.country_id is null
         and result_row.contest_entity_id = participant.contest_entity_id
       )
     )
    where participant.edition_id = _edition_id
  ),
  outcomes as (
    select
      country_id,
      custom_entity_id,
      coalesce(
        bool_or(
          cutoff > 0
          and final_rank between 1 and cutoff
        ),
        false
      ) as qualified,
      bool_or(final_rank is not null) as has_ranked_result
    from semi_rows
    group by country_id, custom_entity_id
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
    and (outcome.has_ranked_result or participant.qualified is true)
    and participant.qualified is distinct from outcome.qualified;
end
$refresh$;

-- Preserve the hardened internal-helper boundary established later in history.
revoke all on function public.refresh_edition_qualifications(uuid)
  from public, anon, authenticated;

grant execute on function public.refresh_edition_qualifications(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;

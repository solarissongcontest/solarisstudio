begin;

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.qualification.current-semifinal-flags', 1, 'forward_fix_only', false, null,
  'Reconcile current semi-final qualification flags when eligible ranked source rows disappear; retain final-only identities and immutable history.'
);
select set_config('request.jwt.claim.role', '', true);

-- Fix the derived flag owner, not the Results scorer or publication/version
-- authority. Current mutable ranks continue to determine qualification; release
-- controls continue to bind public outcomes to the exact immutable version.
-- No backfill rewrites historical editions during migration. Existing function
-- identity, SECURITY DEFINER mode, search_path, owner and ACLs are retained.

create or replace function public.refresh_edition_qualifications(_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with ranked_semis as (
    select
      r.country_id,
      r.contest_entity_id,
      r.final_rank,
      coalesce(
        case
          when (s.voting_config ->> 'qualifiers') ~ '^[0-9]+$'
            then (s.voting_config ->> 'qualifiers')::integer
          else null
        end,
        s.qualifier_count,
        0
      ) as cutoff
    from public.results r
    join public.shows s on s.id = r.show_id
    where s.edition_id = _edition_id
      and s.kind = 'semi-final'
      and r.final_rank is not null
      and exists (
        select 1 from public.participants current_participant
        where current_participant.edition_id = _edition_id
          and current_participant.show_id = r.show_id
          and coalesce(current_participant.participation_status, 'confirmed') = 'confirmed'
          and coalesce(current_participant.country_id, current_participant.contest_entity_id)
              = coalesce(r.country_id, r.contest_entity_id)
      )
  ),
  outcomes as (
    select
      country_id,
      case when country_id is null then contest_entity_id else null end as custom_entity_id,
      bool_or(cutoff > 0 and final_rank between 1 and cutoff) as qualified
    from ranked_semis
    group by
      country_id,
      case when country_id is null then contest_entity_id else null end

    union all

    -- Reconcile identities that lost their last eligible ranked semi-final
    -- result. They must not retain a qualification flag from an older lineup.
    -- Final-only automatic finalists are intentionally outside this set.
    select distinct p.country_id,
      case when p.country_id is null then p.contest_entity_id else null end,
      false
    from public.participants p
    join public.shows s on s.id = p.show_id
    where p.edition_id = _edition_id
      and s.edition_id = _edition_id
      and s.kind = 'semi-final'
      and not exists (
        select 1 from ranked_semis ranked
        where coalesce(ranked.country_id, ranked.contest_entity_id)
            = coalesce(p.country_id, p.contest_entity_id)
      )
  )
  update public.participants p
  set qualified = o.qualified
  from outcomes o
  where p.edition_id = _edition_id
    and (
      (o.country_id is not null and p.country_id = o.country_id)
      or
      (
        o.country_id is null
        and o.custom_entity_id is not null
        and p.country_id is null
        and p.contest_entity_id = o.custom_entity_id
      )
    )
    and p.qualified is distinct from o.qualified;
end;
$$;

commit;

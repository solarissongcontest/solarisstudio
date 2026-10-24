begin;

-- Public V3 P40 / Me -> History.
--
-- This projection intentionally exposes only recipient-linked, edition-scoped
-- relationship evidence Solaris can prove today. It never reconstructs a
-- person's past from their currently-owned country and never treats admin/audit
-- activity as participation history.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.public.p40-personal-participation-history',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive caller-scoped personal participation history projection from direct temporal HOD and jury evidence.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function public.v3_my_participation_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $history$
declare
  v_actor uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION';
  end if;

  with self_person as (
    select person.id
    from public.delegation_people person
    where person.identity_key = 'account:' || v_actor::text
    order by person.id
    limit 1
  ),
  hod_candidates as (
    -- Self-attributed edition claims survive a current-country handover because
    -- country_hod_edition_claims is keyed by user + country + edition. Only
    -- `mine` is affirmative evidence that this account held the relationship;
    -- `other` / `unknown` must never be presented as the caller's HOD history.
    select
      'hod:' || claim.edition_id::text || ':' || claim.country_id::text as id,
      claim.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      claim.country_id,
      country.short_code as country_code,
      coalesce(
        identity.display_name,
        (
          select entity.display_name
          from public.contest_entities entity
          where entity.country_id = claim.country_id
            and entity.edition_id = claim.edition_id
            and entity.entity_type = 'global'
          order by entity.id
          limit 1
        ),
        country.name
      ) as country_name,
      'hod'::text as role,
      null::timestamptz as started_at,
      case
        when assignment.person_id is not null
          and own_person.id is not null
          and assignment.person_id <> own_person.id
        then assignment.updated_at
        else null::timestamptz
      end as ended_at,
      'hod_claim'::text as source,
      case
        -- A canonical delegation assignment to another person makes the
        -- caller's older self-claim explicitly superseded. Do not derive
        -- `current` from editions.status: production retains many historical
        -- editions as `active`, so that field is not a current-context oracle.
        when assignment.person_id is not null
          and own_person.id is not null
          and assignment.person_id <> own_person.id
        then 'superseded'::text
        else 'historical'::text
      end as state,
      claim.updated_at as evidence_at,
      20 as evidence_priority
    from public.country_hod_edition_claims claim
    join public.editions edition
      on edition.id = claim.edition_id
     and edition.published = true
    join public.countries country on country.id = claim.country_id
    left join public.country_edition_identities identity
      on identity.country_id = claim.country_id
     and identity.edition_id = claim.edition_id
    left join self_person own_person on true
    left join public.delegation_hod_assignments assignment
      on assignment.edition_id = claim.edition_id
     and assignment.country_id = claim.country_id
     and assignment.channel = 'delegation'
    where claim.user_id = v_actor
      and claim.status = 'mine'

    union all

    -- Assignments created before/without a self-claim are usable only when the
    -- durable person identity points at this exact account. A corrected claim
    -- suppresses this fallback so stale assignment rows cannot revive it.
    select
      'hod:' || assignment.edition_id::text || ':' || assignment.country_id::text as id,
      assignment.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      assignment.country_id,
      country.short_code as country_code,
      coalesce(
        identity.display_name,
        (
          select entity.display_name
          from public.contest_entities entity
          where entity.country_id = assignment.country_id
            and entity.edition_id = assignment.edition_id
            and entity.entity_type = 'global'
          order by entity.id
          limit 1
        ),
        country.name
      ) as country_name,
      'hod'::text as role,
      assignment.created_at as started_at,
      null::timestamptz as ended_at,
      'hod_assignment'::text as source,
      'historical'::text as state,
      assignment.updated_at as evidence_at,
      10 as evidence_priority
    from public.delegation_hod_assignments assignment
    join public.delegation_people person
      on person.id = assignment.person_id
     and person.identity_key = 'account:' || v_actor::text
    join public.editions edition
      on edition.id = assignment.edition_id
     and edition.published = true
    join public.countries country on country.id = assignment.country_id
    left join public.country_edition_identities identity
      on identity.country_id = assignment.country_id
     and identity.edition_id = assignment.edition_id
    left join public.country_hod_edition_claims claim
      on claim.user_id = v_actor
     and claim.country_id = assignment.country_id
     and claim.edition_id = assignment.edition_id
    where assignment.channel = 'delegation'
      -- An explicit `other` / `unknown` self-claim means Solaris must not revive
      -- an older assignment row and tell the caller they were the HOD.
      and (claim.status is null or claim.status = 'mine')
  ),
  hod_rows as (
    select distinct on (candidate.edition_id, candidate.country_id)
      candidate.id,
      candidate.edition_id,
      candidate.edition_number,
      candidate.edition_name,
      candidate.country_id,
      candidate.country_code,
      candidate.country_name,
      candidate.role,
      candidate.started_at,
      candidate.ended_at,
      candidate.source,
      candidate.state,
      candidate.evidence_at
    from hod_candidates candidate
    order by
      candidate.edition_id,
      candidate.country_id,
      candidate.evidence_priority desc,
      candidate.evidence_at desc nulls last,
      candidate.id
  ),
  jury_rows as (
    select
      'juror:' || member.id::text as id,
      member.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      member.country_id,
      country.short_code as country_code,
      coalesce(
        identity.display_name,
        (
          select entity.display_name
          from public.contest_entities entity
          where entity.country_id = member.country_id
            and entity.edition_id = member.edition_id
            and entity.entity_type = 'global'
          order by entity.id
          limit 1
        ),
        country.name
      ) as country_name,
      'juror'::text as role,
      member.created_at as started_at,
      member.removed_at as ended_at,
      'jury_membership'::text as source,
      case
        -- Jury membership itself has an explicit assigned/removed lifecycle,
        -- so its own current state is usable without consulting stale edition
        -- lifecycle metadata.
        when member.status = 'assigned' and member.removed_at is null
        then 'current'::text
        else 'historical'::text
      end as state,
      coalesce(member.removed_at, member.updated_at, member.created_at) as evidence_at
    from public.studio2_jury_members member
    join public.editions edition
      on edition.id = member.edition_id
     and edition.published = true
    join public.countries country on country.id = member.country_id
    left join public.country_edition_identities identity
      on identity.country_id = member.country_id
     and identity.edition_id = member.edition_id
    where member.member_user_id = v_actor
  ),
  history_rows as (
    select * from hod_rows
    union all
    select * from jury_rows
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', row.id,
        'edition_id', row.edition_id,
        'edition_number', row.edition_number,
        'edition_name', row.edition_name,
        'country_id', row.country_id,
        'country_code', row.country_code,
        'country_name', row.country_name,
        'role', row.role,
        'started_at', row.started_at,
        'ended_at', row.ended_at,
        'source', row.source,
        'state', row.state
      )
      order by
        row.edition_number desc nulls last,
        row.edition_name desc,
        row.evidence_at desc nulls last,
        row.role,
        row.id
    ),
    '[]'::jsonb
  )
  into v_items
  from history_rows row;

  return jsonb_build_object(
    'viewer_id', v_actor,
    'items', v_items,
    'generated_at', clock_timestamp()
  );
end
$history$;

revoke all on function public.v3_my_participation_history()
  from public, anon;
grant execute on function public.v3_my_participation_history()
  to authenticated;

comment on function public.v3_my_participation_history() is
  'Caller-scoped P40 personal participation history from affirmative HOD attribution and temporal jury membership evidence. No ballot content, audit payloads or cross-user contact data.';

notify pgrst, 'reload schema';

commit;

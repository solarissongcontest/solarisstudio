begin;

-- P40 / System contract #618.
--
-- Personal history is a recipient-scoped projection over existing canonical
-- assignment/submission facts. This migration deliberately does not create a
-- second editable history table: corrections remain owned by the underlying
-- HOD/Jury authorities and this read model reconciles their current evidence.
select public.v3_register_migration_contract(
  '20261020004500_v3_personal_participation_history',
  1,
  'forward_fix_only',
  false,
  null,
  'Add authenticated recipient-scoped personal edition/country/role history from canonical HOD and Jury evidence'
);

create or replace function public.v3_my_participation_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $history$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  with current_edition as materialized (
    -- Historical DB rows pre-date the V3 edition lifecycle and several older
    -- editions still carry a generic `active` status. Pick the newest
    -- non-terminal edition deterministically instead of treating every legacy
    -- `active` edition as current.
    select edition.id
    from public.editions edition
    where lower(coalesce(edition.status, '')) not in ('completed', 'archived', 'cancelled')
    order by edition.edition_number desc nulls last,
             edition.event_date desc nulls last,
             edition.created_at desc,
             edition.id desc
    limit 1
  ),
  canonical_hod as (
    select
      'ph_' || md5('hod-assignment:' || assignment.id::text || ':' || v_user::text) as id,
      assignment.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      assignment.country_id,
      country.short_code as country_code,
      coalesce(nullif(btrim(history_identity.display_name), ''), country.name) as country_name,
      'hod'::text as role,
      assignment.created_at as started_at,
      null::timestamptz as ended_at,
      'delegation_membership'::text as source,
      case
        when assignment.edition_id = (select id from current_edition) then 'current'
        else 'historical'
      end::text as state,
      assignment.updated_at as evidence_at
    from public.delegation_hod_assignments assignment
    join public.delegation_people person
      on person.id = assignment.person_id
     and person.identity_key = 'account:' || v_user::text
    join public.editions edition on edition.id = assignment.edition_id
    join public.countries country on country.id = assignment.country_id
    left join public.country_edition_identities history_identity
      on history_identity.country_id = assignment.country_id
     and history_identity.edition_id = assignment.edition_id
    where assignment.channel = 'delegation'
  ),
  reconciled_hod_claims as (
    -- Legacy self-attribution is useful evidence after country handovers, but it
    -- is not allowed to outrank Organizer-managed canonical assignment truth.
    -- If it no longer matches the canonical assignment it is retained only as
    -- superseded/unavailable reconciliation evidence.
    select
      'ph_' || md5(
        'hod-claim:' || claim.edition_id::text || ':' || claim.country_id::text || ':' || v_user::text
      ) as id,
      claim.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      claim.country_id,
      country.short_code as country_code,
      coalesce(nullif(btrim(history_identity.display_name), ''), country.name) as country_name,
      'hod'::text as role,
      null::timestamptz as started_at,
      null::timestamptz as ended_at,
      'legacy_hod_claim'::text as source,
      case
        when canonical_assignment.id is not null then 'superseded'
        else 'unavailable'
      end::text as state,
      claim.updated_at as evidence_at
    from public.country_hod_edition_claims claim
    join public.editions edition on edition.id = claim.edition_id
    join public.countries country on country.id = claim.country_id
    left join public.country_edition_identities history_identity
      on history_identity.country_id = claim.country_id
     and history_identity.edition_id = claim.edition_id
    left join public.delegation_hod_assignments canonical_assignment
      on canonical_assignment.edition_id = claim.edition_id
     and canonical_assignment.country_id = claim.country_id
     and canonical_assignment.channel = 'delegation'
    where claim.user_id = v_user
      and claim.status = 'mine'
      and not exists (
        select 1
        from public.delegation_hod_assignments own_assignment
        join public.delegation_people own_person
          on own_person.id = own_assignment.person_id
         and own_person.identity_key = 'account:' || v_user::text
        where own_assignment.edition_id = claim.edition_id
          and own_assignment.country_id = claim.country_id
          and own_assignment.channel = 'delegation'
      )
  ),
  canonical_jury_membership as (
    select
      'ph_' || md5('jury-member:' || member.id::text || ':' || v_user::text) as id,
      member.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      member.country_id,
      country.short_code as country_code,
      coalesce(nullif(btrim(history_identity.display_name), ''), country.name) as country_name,
      'juror'::text as role,
      member.created_at as started_at,
      member.removed_at as ended_at,
      'jury_membership'::text as source,
      case
        when member.status = 'removed' then 'superseded'
        when member.edition_id = (select id from current_edition) then 'current'
        else 'historical'
      end::text as state,
      member.updated_at as evidence_at
    from public.studio2_jury_members member
    join public.editions edition on edition.id = member.edition_id
    join public.countries country on country.id = member.country_id
    left join public.country_edition_identities history_identity
      on history_identity.country_id = member.country_id
     and history_identity.edition_id = member.edition_id
    where member.member_user_id = v_user
  ),
  legacy_jury_submission as (
    -- Older/current official Jury submissions are useful recipient-owned role
    -- evidence when no explicit Jury-member row exists. Ballot content, risk
    -- scores and review evidence are intentionally never selected.
    select
      'ph_' || md5(
        'jury-submission:' || submission.edition_id::text || ':' || submission.voter_country_id::text || ':' || v_user::text
      ) as id,
      submission.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      submission.voter_country_id as country_id,
      country.short_code as country_code,
      coalesce(nullif(btrim(history_identity.display_name), ''), country.name) as country_name,
      'juror'::text as role,
      min(submission.submitted_at) as started_at,
      null::timestamptz as ended_at,
      'jury_submission'::text as source,
      case
        when bool_or(submission.status = 'submitted') then
          case
            when submission.edition_id = (select id from current_edition) then 'current'
            else 'historical'
          end
        else 'superseded'
      end::text as state,
      max(submission.updated_at) as evidence_at
    from public.jury_ballot_submissions submission
    join public.editions edition on edition.id = submission.edition_id
    join public.countries country on country.id = submission.voter_country_id
    left join public.country_edition_identities history_identity
      on history_identity.country_id = submission.voter_country_id
     and history_identity.edition_id = submission.edition_id
    where submission.user_id = v_user
      and not exists (
        select 1
        from public.studio2_jury_members member
        where member.member_user_id = v_user
          and member.edition_id = submission.edition_id
          and member.country_id = submission.voter_country_id
      )
    group by
      submission.edition_id,
      edition.edition_number,
      edition.name,
      submission.voter_country_id,
      country.short_code,
      country.name,
      history_identity.display_name
  ),
  combined as (
    select * from canonical_hod
    union all
    select * from reconciled_hod_claims
    union all
    select * from canonical_jury_membership
    union all
    select * from legacy_jury_submission
  ),
  bounded as (
    select *
    from combined
    order by edition_number desc nulls last,
             evidence_at desc nulls last,
             edition_id desc,
             country_id desc,
             role,
             id
    limit 500
  )
  select jsonb_build_object(
    'schema_version', 1,
    'viewer_id', v_user,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'edition_id', item.edition_id,
          'edition_number', item.edition_number,
          'edition_name', item.edition_name,
          'country_id', item.country_id,
          'country_code', item.country_code,
          'country_name', item.country_name,
          'role', item.role,
          'started_at', item.started_at,
          'ended_at', item.ended_at,
          'source', item.source,
          'state', item.state
        )
        order by item.edition_number desc nulls last,
                 item.evidence_at desc nulls last,
                 item.edition_id desc,
                 item.country_id desc,
                 item.role,
                 item.id
      ),
      '[]'::jsonb
    ),
    'generated_at', now()
  )
  into v_result
  from bounded item;

  return coalesce(
    v_result,
    jsonb_build_object(
      'schema_version', 1,
      'viewer_id', v_user,
      'items', '[]'::jsonb,
      'generated_at', now()
    )
  );
end
$history$;

revoke all on function public.v3_my_participation_history() from public, anon, authenticated;
grant execute on function public.v3_my_participation_history() to authenticated;

comment on function public.v3_my_participation_history() is
  'Recipient-scoped V3 P40 personal participation history. Uses canonical per-edition HOD/Jury evidence, reconciles legacy HOD claims without promoting them over canonical assignments, and never returns ballot content, capability codes, audit payloads, contact details or another viewer history.';

notify pgrst, 'reload schema';

commit;

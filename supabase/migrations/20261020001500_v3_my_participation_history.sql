begin;

-- Solaris Studio V3 P41 / Me History integration.
--
-- Personal history must be derived from durable edition-scoped evidence, never
-- reconstructed from whichever country account the viewer happens to own now.
-- This projection therefore uses canonical HOD assignments and jury evidence.
-- It deliberately does not fabricate a generic Participant role where no
-- durable user -> participant identity relationship exists.

create or replace function public.v3_my_participation_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $history$
declare
  v_actor uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  with actor_people as (
    select person.id
    from public.delegation_people person
    where person.identity_key = 'account:' || v_actor::text
  ),
  selected_jurors as (
    select distinct on (assignment.edition_id, assignment.country_id)
      assignment.id,
      assignment.edition_id,
      assignment.country_id,
      assignment.person_id,
      assignment.channel,
      assignment.source,
      assignment.created_at,
      assignment.updated_at
    from public.delegation_hod_assignments assignment
    where assignment.channel in ('jury', 'delegation')
    order by
      assignment.edition_id,
      assignment.country_id,
      case when assignment.channel = 'jury' then 0 else 1 end,
      assignment.updated_at desc,
      assignment.id
  ),
  hod_evidence as (
    select
      'hod:' || assignment.id::text as id,
      assignment.edition_id,
      assignment.country_id,
      'hod'::text as role,
      ('delegation_hod_assignment:' || coalesce(nullif(btrim(assignment.source), ''), 'canonical'))::text as source,
      null::timestamptz as started_at,
      null::timestamptz as ended_at
    from public.delegation_hod_assignments assignment
    join actor_people actor_person on actor_person.id = assignment.person_id
    where assignment.channel = 'delegation'
  ),
  ballot_juror_evidence as (
    select
      'juror-ballot:' || ballot.edition_id::text || ':' || ballot.voter_country_id::text as id,
      ballot.edition_id,
      ballot.voter_country_id as country_id,
      'juror'::text as role,
      'jury_ballot_submission'::text as source,
      null::timestamptz as started_at,
      null::timestamptz as ended_at
    from public.jury_ballot_submissions ballot
    where ballot.user_id = v_actor
    group by ballot.edition_id, ballot.voter_country_id
  ),
  assigned_juror_evidence as (
    select
      'juror-assignment:' || juror.id::text as id,
      juror.edition_id,
      juror.country_id,
      'juror'::text as role,
      (
        'jury_hod_assignment:' || juror.channel || ':' ||
        coalesce(nullif(btrim(juror.source), ''), 'canonical')
      )::text as source,
      null::timestamptz as started_at,
      null::timestamptz as ended_at
    from selected_jurors juror
    join actor_people actor_person on actor_person.id = juror.person_id
    where not exists (
      select 1
      from public.jury_ballot_submissions ballot
      where ballot.user_id = v_actor
        and ballot.edition_id = juror.edition_id
        and ballot.voter_country_id = juror.country_id
    )
  ),
  evidence as (
    select * from hod_evidence
    union all
    select * from ballot_juror_evidence
    union all
    select * from assigned_juror_evidence
  ),
  enriched as (
    select
      evidence.id,
      evidence.edition_id,
      edition.edition_number,
      edition.name as edition_name,
      evidence.country_id,
      coalesce(entity.abbreviation, country.short_code) as country_code,
      coalesce(identity.display_name, entity.display_name, country.name) as country_name,
      evidence.role,
      evidence.started_at,
      evidence.ended_at,
      evidence.source,
      case
        -- Existing Solaris databases historically used fewer lifecycle labels.
        -- Closed terminal states are unambiguously historical; every other
        -- nonterminal/future state remains current rather than being guessed.
        when edition.status in ('completed', 'archived', 'cancelled') then 'historical'
        else 'current'
      end as state
    from evidence
    join public.editions edition on edition.id = evidence.edition_id
    join public.countries country on country.id = evidence.country_id
    left join public.country_edition_identities identity
      on identity.country_id = evidence.country_id
     and identity.edition_id = evidence.edition_id
    left join lateral (
      select contest_entity.display_name, contest_entity.abbreviation
      from public.contest_entities contest_entity
      where contest_entity.edition_id = evidence.edition_id
        and contest_entity.country_id = evidence.country_id
        and contest_entity.entity_type = 'global'
      order by contest_entity.historical_identity_override desc, contest_entity.updated_at desc, contest_entity.id
      limit 1
    ) entity on true
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', enriched.id,
        'edition_id', enriched.edition_id,
        'edition_number', enriched.edition_number,
        'edition_name', enriched.edition_name,
        'country_id', enriched.country_id,
        'country_code', enriched.country_code,
        'country_name', enriched.country_name,
        'role', enriched.role,
        'started_at', enriched.started_at,
        'ended_at', enriched.ended_at,
        'source', enriched.source,
        'state', enriched.state
      )
      order by enriched.edition_number desc nulls last, enriched.edition_name, enriched.country_name, enriched.role
    ),
    '[]'::jsonb
  ) into v_items
  from enriched;

  return jsonb_build_object(
    'viewer_id', v_actor,
    'items', v_items,
    'generated_at', clock_timestamp()
  );
end
$history$;

revoke all on function public.v3_my_participation_history()
  from public, anon, authenticated, service_role;
grant execute on function public.v3_my_participation_history()
  to authenticated;

comment on function public.v3_my_participation_history() is
  'Recipient-scoped V3 Me participation history derived from canonical edition HOD assignments, canonical jury identity and immutable jury submission evidence. It never infers past participation from current country ownership.';

notify pgrst, 'reload schema';

commit;

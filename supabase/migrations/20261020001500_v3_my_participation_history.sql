begin;

-- Solaris Studio V3 P40 / Me History integration.
--
-- Personal history must be derived from durable edition-scoped evidence, never
-- reconstructed from whichever country account the viewer happens to own now.
-- `delegation_hod_assignments` is intentionally the one-row current assignment
-- authority, so handovers update that row in place. Capture those revisions in
-- a private append-only history before exposing personal cross-time history.

create table if not exists private.v3_delegation_hod_assignment_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  channel text not null,
  source text not null,
  confidence integer not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  change_kind text not null,
  captured_at timestamptz not null default now(),
  constraint v3_hod_assignment_history_channel_check
    check (channel in ('delegation', 'jury', 'televote')),
  constraint v3_hod_assignment_history_confidence_check
    check (confidence between 0 and 100),
  constraint v3_hod_assignment_history_change_kind_check
    check (change_kind in ('backfill', 'insert', 'update', 'delete')),
  constraint v3_hod_assignment_history_window_check
    check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists v3_hod_assignment_history_one_open_revision
  on private.v3_delegation_hod_assignment_history (assignment_id)
  where valid_to is null;

create index if not exists v3_hod_assignment_history_person_idx
  on private.v3_delegation_hod_assignment_history (person_id, edition_id, country_id, channel);

revoke all on table private.v3_delegation_hod_assignment_history
  from public, anon, authenticated, service_role;

insert into private.v3_delegation_hod_assignment_history (
  assignment_id,
  edition_id,
  country_id,
  person_id,
  channel,
  source,
  confidence,
  valid_from,
  valid_to,
  change_kind
)
select
  assignment.id,
  assignment.edition_id,
  assignment.country_id,
  assignment.person_id,
  assignment.channel,
  assignment.source,
  assignment.confidence,
  assignment.created_at,
  null,
  'backfill'
from public.delegation_hod_assignments assignment
where not exists (
  select 1
  from private.v3_delegation_hod_assignment_history history
  where history.assignment_id = assignment.id
    and history.valid_to is null
);

create or replace function private.v3_capture_delegation_hod_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    insert into private.v3_delegation_hod_assignment_history (
      assignment_id,
      edition_id,
      country_id,
      person_id,
      channel,
      source,
      confidence,
      valid_from,
      valid_to,
      change_kind
    ) values (
      new.id,
      new.edition_id,
      new.country_id,
      new.person_id,
      new.channel,
      new.source,
      new.confidence,
      coalesce(new.created_at, v_now),
      null,
      'insert'
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if row(
      new.edition_id,
      new.country_id,
      new.person_id,
      new.channel
    ) is distinct from row(
      old.edition_id,
      old.country_id,
      old.person_id,
      old.channel
    ) then
      update private.v3_delegation_hod_assignment_history history
      set valid_to = v_now
      where history.assignment_id = old.id
        and history.valid_to is null;

      insert into private.v3_delegation_hod_assignment_history (
        assignment_id,
        edition_id,
        country_id,
        person_id,
        channel,
        source,
        confidence,
        valid_from,
        valid_to,
        change_kind
      ) values (
        new.id,
        new.edition_id,
        new.country_id,
        new.person_id,
        new.channel,
        new.source,
        new.confidence,
        v_now,
        null,
        'update'
      );
    elsif new.source is distinct from old.source
       or new.confidence is distinct from old.confidence then
      -- Evidence metadata can improve without creating a fictional handover.
      update private.v3_delegation_hod_assignment_history history
      set
        source = new.source,
        confidence = new.confidence
      where history.assignment_id = new.id
        and history.valid_to is null;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update private.v3_delegation_hod_assignment_history history
    set valid_to = v_now
    where history.assignment_id = old.id
      and history.valid_to is null;
    return old;
  end if;

  raise exception 'Unsupported HOD assignment history trigger operation: %', tg_op
    using errcode = '0A000';
end
$capture$;

revoke all on function private.v3_capture_delegation_hod_assignment_history()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_capture_delegation_hod_assignment_history
  on public.delegation_hod_assignments;
create trigger v3_capture_delegation_hod_assignment_history
after insert or update or delete on public.delegation_hod_assignments
for each row execute function private.v3_capture_delegation_hod_assignment_history();

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
  hod_history_evidence as (
    select
      'hod-history:' || history.id::text as id,
      history.edition_id,
      history.country_id,
      'hod'::text as role,
      ('delegation_hod_assignment:' || coalesce(nullif(btrim(history.source), ''), 'canonical'))::text as source,
      history.valid_from as started_at,
      history.valid_to as ended_at,
      case when history.valid_to is not null then 'superseded'::text else null::text end as relation_state
    from private.v3_delegation_hod_assignment_history history
    join actor_people actor_person on actor_person.id = history.person_id
    where history.channel = 'delegation'
  ),
  hod_claim_evidence as (
    -- `country_hod_edition_claims` predates the revision capture above and is
    -- the only durable evidence for some already-completed self-attributions
    -- that may have been overwritten in the one-row assignment table.
    select
      'hod-claim:' || claim.user_id::text || ':' || claim.country_id::text || ':' || claim.edition_id::text as id,
      claim.edition_id,
      claim.country_id,
      'hod'::text as role,
      'country_hod_edition_claim'::text as source,
      null::timestamptz as started_at,
      null::timestamptz as ended_at,
      case
        when exists (
          select 1
          from public.delegation_hod_assignments current_assignment
          join public.delegation_people current_person
            on current_person.id = current_assignment.person_id
          where current_assignment.edition_id = claim.edition_id
            and current_assignment.country_id = claim.country_id
            and current_assignment.channel = 'delegation'
            and current_person.identity_key <> 'account:' || v_actor::text
        ) then 'superseded'::text
        else null::text
      end as relation_state
    from public.country_hod_edition_claims claim
    where claim.user_id = v_actor
      and claim.status = 'mine'
      and not exists (
        select 1
        from private.v3_delegation_hod_assignment_history history
        join actor_people actor_person on actor_person.id = history.person_id
        where history.edition_id = claim.edition_id
          and history.country_id = claim.country_id
          and history.channel = 'delegation'
      )
  ),
  ballot_juror_evidence as (
    select
      'juror-ballot:' || ballot.edition_id::text || ':' || ballot.voter_country_id::text as id,
      ballot.edition_id,
      ballot.voter_country_id as country_id,
      'juror'::text as role,
      'jury_ballot_submission'::text as source,
      null::timestamptz as started_at,
      null::timestamptz as ended_at,
      null::text as relation_state
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
      null::timestamptz as ended_at,
      null::text as relation_state
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
    select * from hod_history_evidence
    union all
    select * from hod_claim_evidence
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
      coalesce(
        evidence.relation_state,
        case
          -- Existing Solaris databases historically used fewer lifecycle labels.
          -- Closed terminal states are unambiguously historical; every other
          -- nonterminal/future state remains current rather than being guessed.
          when edition.status in ('completed', 'archived', 'cancelled') then 'historical'
          else 'current'
        end
      ) as state
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
      order by
        enriched.edition_number desc nulls last,
        enriched.edition_name,
        enriched.country_name,
        enriched.role,
        enriched.started_at desc nulls last,
        enriched.id
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
  'Recipient-scoped V3 Me participation history derived from canonical HOD assignment revisions, preserved HOD claims, canonical jury identity and immutable jury submission evidence. It never infers past participation from current country ownership.';

notify pgrst, 'reload schema';

commit;

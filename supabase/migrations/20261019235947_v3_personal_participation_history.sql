begin;

-- Public V3 P40 / System contract #618: recipient-scoped personal participation
-- history. Existing HOD assignment/claim rows are mutable operational state, so
-- future handovers and corrections need append-only attribution evidence instead
-- of making the latest row pretend it was always true.
select public.v3_register_migration_contract(
  '20261019235947_v3_personal_participation_history',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive P40 personal-history projection plus append-only derived HOD attribution evidence; surviving current attribution is backfilled without inventing overwritten history.'
);

create table if not exists private.v3_hod_attribution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  edition_id uuid not null references public.editions(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  event_kind text not null check (event_kind in ('attributed', 'ended', 'superseded')),
  source text not null check (source in ('assignment', 'claim', 'assignment_backfill', 'claim_backfill')),
  source_key text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint v3_hod_attribution_events_source_key_check
    check (length(btrim(source_key)) between 1 and 320),
  unique (user_id, edition_id, country_id, event_kind, source, source_key, occurred_at)
);

create index if not exists v3_hod_attribution_events_user_time_idx
  on private.v3_hod_attribution_events (user_id, occurred_at desc, id desc);
create index if not exists v3_hod_attribution_events_scope_idx
  on private.v3_hod_attribution_events (edition_id, country_id, user_id, occurred_at desc);

revoke all on table private.v3_hod_attribution_events from public, anon, authenticated;

create or replace function private.v3_delegation_person_account_user(p_person_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_identity text;
  v_user uuid;
begin
  if p_person_id is null then
    return null;
  end if;

  select person.identity_key
  into v_identity
  from public.delegation_people person
  where person.id = p_person_id;

  if v_identity is null or v_identity !~ '^account:[0-9a-fA-F-]{36}$' then
    return null;
  end if;

  begin
    v_user := substring(v_identity from 9)::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  return v_user;
end
$resolve$;

revoke all on function private.v3_delegation_person_account_user(uuid)
  from public, anon, authenticated;

-- Backfill only attribution that still survives in canonical operational rows.
-- This deliberately does not guess previous HODs that an older mutable row may
-- already have overwritten.
insert into private.v3_hod_attribution_events (
  user_id,
  edition_id,
  country_id,
  event_kind,
  source,
  source_key,
  occurred_at
)
select
  private.v3_delegation_person_account_user(assignment.person_id),
  assignment.edition_id,
  assignment.country_id,
  'attributed',
  'assignment_backfill',
  assignment.id::text,
  coalesce(assignment.created_at, assignment.updated_at, now())
from public.delegation_hod_assignments assignment
where assignment.channel = 'delegation'
  and private.v3_delegation_person_account_user(assignment.person_id) is not null
on conflict do nothing;

insert into private.v3_hod_attribution_events (
  user_id,
  edition_id,
  country_id,
  event_kind,
  source,
  source_key,
  occurred_at
)
select
  claim.user_id,
  claim.edition_id,
  claim.country_id,
  'attributed',
  'claim_backfill',
  claim.user_id::text || ':' || claim.country_id::text || ':' || claim.edition_id::text,
  claim.updated_at
from public.country_hod_edition_claims claim
where claim.status = 'mine'
  and not exists (
    select 1
    from public.delegation_hod_assignments assignment
    join public.delegation_people person on person.id = assignment.person_id
    where assignment.edition_id = claim.edition_id
      and assignment.country_id = claim.country_id
      and assignment.channel = 'delegation'
      and person.identity_key = 'account:' || claim.user_id::text
  )
on conflict do nothing;

create or replace function private.v3_capture_hod_assignment_attribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_old_user uuid;
  v_new_user uuid;
  v_changed boolean := false;
  v_at timestamptz := now();
begin
  if tg_op <> 'INSERT' then
    v_old_user := private.v3_delegation_person_account_user(old.person_id);
  end if;
  if tg_op <> 'DELETE' then
    v_new_user := private.v3_delegation_person_account_user(new.person_id);
    v_at := coalesce(new.updated_at, new.created_at, now());
  else
    v_at := coalesce(old.updated_at, old.created_at, now());
  end if;

  if tg_op = 'UPDATE' then
    v_changed := old.person_id is distinct from new.person_id
      or old.edition_id is distinct from new.edition_id
      or old.country_id is distinct from new.country_id
      or old.channel is distinct from new.channel;
    if not v_changed then
      return new;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old.channel = 'delegation'
     and v_old_user is not null then
    insert into private.v3_hod_attribution_events (
      user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
    ) values (
      v_old_user,
      old.edition_id,
      old.country_id,
      'ended',
      'assignment',
      old.id::text,
      v_at
    ) on conflict do nothing;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.channel = 'delegation'
     and v_new_user is not null then
    insert into private.v3_hod_attribution_events (
      user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
    ) values (
      v_new_user,
      new.edition_id,
      new.country_id,
      'attributed',
      'assignment',
      new.id::text,
      v_at
    ) on conflict do nothing;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$capture$;

revoke all on function private.v3_capture_hod_assignment_attribution()
  from public, anon, authenticated;

drop trigger if exists v3_capture_hod_assignment_attribution
  on public.delegation_hod_assignments;
create trigger v3_capture_hod_assignment_attribution
after insert or update of person_id, edition_id, country_id, channel or delete
on public.delegation_hod_assignments
for each row execute function private.v3_capture_hod_assignment_attribution();

create or replace function private.v3_capture_hod_claim_attribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_key text;
  v_at timestamptz := now();
begin
  if tg_op = 'INSERT' then
    if new.status = 'mine' then
      v_key := new.user_id::text || ':' || new.country_id::text || ':' || new.edition_id::text;
      insert into private.v3_hod_attribution_events (
        user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
      ) values (
        new.user_id, new.edition_id, new.country_id, 'attributed', 'claim', v_key,
        coalesce(new.updated_at, now())
      ) on conflict do nothing;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_key := new.user_id::text || ':' || new.country_id::text || ':' || new.edition_id::text;
      v_at := coalesce(new.updated_at, now());
      if old.status = 'mine' and new.status <> 'mine' then
        insert into private.v3_hod_attribution_events (
          user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
        ) values (
          old.user_id, old.edition_id, old.country_id, 'superseded', 'claim', v_key, v_at
        ) on conflict do nothing;
      elsif old.status <> 'mine' and new.status = 'mine' then
        insert into private.v3_hod_attribution_events (
          user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
        ) values (
          new.user_id, new.edition_id, new.country_id, 'attributed', 'claim', v_key, v_at
        ) on conflict do nothing;
      end if;
    end if;
    return new;
  end if;

  if old.status = 'mine' then
    v_key := old.user_id::text || ':' || old.country_id::text || ':' || old.edition_id::text;
    insert into private.v3_hod_attribution_events (
      user_id, edition_id, country_id, event_kind, source, source_key, occurred_at
    ) values (
      old.user_id, old.edition_id, old.country_id, 'superseded', 'claim', v_key,
      coalesce(old.updated_at, now())
    ) on conflict do nothing;
  end if;
  return old;
end
$capture$;

revoke all on function private.v3_capture_hod_claim_attribution()
  from public, anon, authenticated;

drop trigger if exists v3_capture_hod_claim_attribution
  on public.country_hod_edition_claims;
create trigger v3_capture_hod_claim_attribution
after insert or update of status or delete
on public.country_hod_edition_claims
for each row execute function private.v3_capture_hod_claim_attribution();

create or replace function private.v3_hod_attribution_events_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $immutable$
begin
  raise exception 'V3 HOD attribution history is append-only'
    using errcode = '55000';
end
$immutable$;

revoke all on function private.v3_hod_attribution_events_immutable()
  from public, anon, authenticated;

drop trigger if exists v3_hod_attribution_events_immutable
  on private.v3_hod_attribution_events;
create trigger v3_hod_attribution_events_immutable
before update or delete on private.v3_hod_attribution_events
for each row execute function private.v3_hod_attribution_events_immutable();

create or replace function public.v3_my_participation_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $history$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  with hod_rollup as (
    select
      event.edition_id,
      event.country_id,
      min(event.occurred_at) filter (where event.event_kind = 'attributed') as started_at,
      max(event.occurred_at) filter (where event.event_kind = 'attributed') as latest_attributed_at,
      max(event.occurred_at) filter (where event.event_kind = 'ended') as latest_ended_at,
      max(event.occurred_at) filter (where event.event_kind = 'superseded') as latest_superseded_at
    from private.v3_hod_attribution_events event
    where event.user_id = v_user
    group by event.edition_id, event.country_id
    having count(*) filter (where event.event_kind = 'attributed') > 0
  ),
  hod_items as (
    select
      'hod:' || rollup.edition_id::text || ':' || rollup.country_id::text as id,
      rollup.edition_id,
      edition.edition_number,
      edition.name::text as edition_name,
      rollup.country_id,
      country.short_code::text as country_code,
      coalesce(identity.display_name, country.name)::text as country_name,
      'hod'::text as role,
      rollup.started_at,
      case
        when rollup.latest_superseded_at >= rollup.latest_attributed_at
          then rollup.latest_superseded_at
        when rollup.latest_ended_at >= rollup.latest_attributed_at
          then rollup.latest_ended_at
        else null
      end as ended_at,
      'hod_attribution'::text as source,
      case
        when rollup.latest_superseded_at >= rollup.latest_attributed_at then 'superseded'
        when rollup.latest_ended_at >= rollup.latest_attributed_at then 'historical'
        when lower(coalesce(edition.status, '')) = 'cancelled' then 'unavailable'
        when lower(coalesce(edition.status, '')) in ('complete', 'completed', 'archived') then 'historical'
        else 'current'
      end::text as state
    from hod_rollup rollup
    join public.editions edition on edition.id = rollup.edition_id
    join public.countries country on country.id = rollup.country_id
    left join public.country_edition_identities identity
      on identity.edition_id = rollup.edition_id
     and identity.country_id = rollup.country_id
  ),
  jury_rollup as (
    select
      ballot.edition_id,
      ballot.voter_country_id as country_id,
      min(ballot.submitted_at) as started_at,
      bool_or(ballot.status not in ('superseded', 'excluded')) as has_current_ballot,
      bool_or(ballot.status = 'superseded') as has_superseded_ballot,
      bool_or(ballot.status = 'excluded') as has_excluded_ballot
    from public.jury_ballot_submissions ballot
    where ballot.user_id = v_user
    group by ballot.edition_id, ballot.voter_country_id
  ),
  jury_items as (
    select
      'juror:' || rollup.edition_id::text || ':' || rollup.country_id::text as id,
      rollup.edition_id,
      edition.edition_number,
      edition.name::text as edition_name,
      rollup.country_id,
      country.short_code::text as country_code,
      coalesce(identity.display_name, country.name)::text as country_name,
      'juror'::text as role,
      rollup.started_at,
      null::timestamptz as ended_at,
      'jury_ballot_submission'::text as source,
      case
        when not rollup.has_current_ballot and rollup.has_superseded_ballot then 'superseded'
        when not rollup.has_current_ballot and rollup.has_excluded_ballot then 'unavailable'
        when lower(coalesce(edition.status, '')) = 'cancelled' then 'unavailable'
        when lower(coalesce(edition.status, '')) in ('complete', 'completed', 'archived') then 'historical'
        else 'current'
      end::text as state
    from jury_rollup rollup
    join public.editions edition on edition.id = rollup.edition_id
    join public.countries country on country.id = rollup.country_id
    left join public.country_edition_identities identity
      on identity.edition_id = rollup.edition_id
     and identity.country_id = rollup.country_id
  ),
  confirmation_facts as (
    select
      event.id as event_id,
      event.edition_id,
      event.occurred_at,
      submission.country::text as submission_country,
      submission.participating,
      row_number() over (
        partition by event.edition_id, lower(btrim(coalesce(submission.country, '')))
        order by event.occurred_at desc, event.id desc
      ) as recency_rank,
      bool_or(submission.participating) over (
        partition by event.edition_id, lower(btrim(coalesce(submission.country, '')))
      ) as ever_participated,
      min(event.occurred_at) filter (where submission.participating) over (
        partition by event.edition_id, lower(btrim(coalesce(submission.country, '')))
      ) as first_participated_at
    from private.v3_domain_events event
    join public.submissions submission
      on submission.id::text = event.aggregate_id
     and submission.edition_id = event.edition_id
    where event.actor_id = v_user
      and event.event_type = 'confirmation.submitted'
      and event.aggregate_type = 'confirmation_submission'
  ),
  confirmation_latest as (
    select fact.*
    from confirmation_facts fact
    where fact.recency_rank = 1
      and fact.ever_participated
  ),
  confirmation_resolved as (
    select
      latest.*,
      resolved.country_id,
      resolved.country_code,
      resolved.country_name
    from confirmation_latest latest
    left join lateral (
      select
        country.id as country_id,
        country.short_code::text as country_code,
        coalesce(identity.display_name, country.name)::text as country_name
      from public.countries country
      left join public.country_edition_identities identity
        on identity.country_id = country.id
       and identity.edition_id = latest.edition_id
      where lower(btrim(country.name)) = lower(btrim(latest.submission_country))
         or lower(btrim(coalesce(identity.display_name, ''))) = lower(btrim(latest.submission_country))
      order by case when lower(btrim(coalesce(identity.display_name, ''))) = lower(btrim(latest.submission_country)) then 0 else 1 end,
               country.id
      limit 1
    ) resolved on true
  ),
  participant_items as (
    select
      'participant:' || latest.edition_id::text || ':' || coalesce(latest.country_id::text, md5(lower(btrim(latest.submission_country)))) as id,
      latest.edition_id,
      edition.edition_number,
      edition.name::text as edition_name,
      latest.country_id,
      latest.country_code,
      coalesce(latest.country_name, nullif(btrim(latest.submission_country), ''))::text as country_name,
      'participant'::text as role,
      latest.first_participated_at as started_at,
      case when not latest.participating then latest.occurred_at else null end as ended_at,
      'confirmation_submission'::text as source,
      case
        when not latest.participating then 'superseded'
        when lower(coalesce(edition.status, '')) = 'cancelled' then 'unavailable'
        when lower(coalesce(edition.status, '')) in ('complete', 'completed', 'archived') then 'historical'
        else 'current'
      end::text as state
    from confirmation_resolved latest
    join public.editions edition on edition.id = latest.edition_id
  ),
  all_items as (
    select * from hod_items
    union all
    select * from jury_items
    union all
    select * from participant_items
  ),
  item_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
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
        ))
        order by item.edition_number desc nulls last, item.started_at desc nulls last, item.id
      ),
      '[]'::jsonb
    ) as items
    from all_items item
  )
  select jsonb_build_object(
    'schema_ready', true,
    'viewer_id', v_user,
    'items', item_json.items,
    'generated_at', now()
  )
  into v_result
  from item_json;

  return coalesce(
    v_result,
    jsonb_build_object(
      'schema_ready', true,
      'viewer_id', v_user,
      'items', '[]'::jsonb,
      'generated_at', now()
    )
  );
end
$history$;

comment on function public.v3_my_participation_history() is
  'Authenticated no-argument Public V3 P40 personal participation history derived from canonical HOD attribution evidence, Jury submissions and Confirmation facts. Never exposes ballot contents, private event payloads or another user history.';

revoke all on function public.v3_my_participation_history()
  from public, anon;
grant execute on function public.v3_my_participation_history()
  to authenticated;

notify pgrst, 'reload schema';

commit;

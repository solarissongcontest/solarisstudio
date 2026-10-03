begin;

-- Organisation OS V5: canonical edition confirmation requirements.
--
-- A requirement belongs to one edition + one country. A submission round is
-- only a window in which a requirement may be fulfilled. Opening, closing or
-- creating a round MUST NOT create a new requirement or a new generation.
--
-- Reconfirmation is explicit: the current resolved generation is invalidated
-- and superseded, then a new required generation is created.

create table if not exists public.studio2_confirmation_requirements (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  generation integer not null default 1 check (generation >= 1),
  status text not null default 'required'
    check (status in ('required', 'satisfied', 'waived', 'invalidated')),
  reason text not null check (length(btrim(reason)) >= 3),
  valid_from timestamptz not null default now(),
  resolved_by_submission_id uuid references public.submissions(id) on delete set null,
  resolved_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid references auth.users(id) on delete set null,
  invalidated_reason text,
  superseded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, country_id, generation),
  constraint studio2_confirmation_requirement_resolution_check check (
    (status = 'required' and resolved_at is null)
    or (status in ('satisfied', 'waived') and resolved_at is not null)
    or status = 'invalidated'
  ),
  constraint studio2_confirmation_requirement_invalidation_check check (
    status <> 'invalidated'
    or (invalidated_at is not null and invalidated_reason is not null)
  )
);

create unique index if not exists studio2_confirmation_requirements_current_idx
  on public.studio2_confirmation_requirements (edition_id, country_id)
  where superseded_at is null;

create index if not exists studio2_confirmation_requirements_edition_state_idx
  on public.studio2_confirmation_requirements (edition_id, status, country_id)
  where superseded_at is null;

create index if not exists studio2_confirmation_requirements_submission_idx
  on public.studio2_confirmation_requirements (resolved_by_submission_id)
  where resolved_by_submission_id is not null;

alter table public.studio2_confirmation_requirements enable row level security;
revoke all on table public.studio2_confirmation_requirements
  from public, anon, authenticated;
grant all on table public.studio2_confirmation_requirements to service_role;

create or replace function private.studio2_confirmation_country_id(
  p_country text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select country.id
  from public.countries country
  where lower(btrim(country.name)) = lower(btrim(coalesce(p_country, '')))
     or lower(btrim(country.short_code)) = lower(btrim(coalesce(p_country, '')))
  order by
    case when lower(btrim(country.name)) = lower(btrim(coalesce(p_country, ''))) then 0 else 1 end,
    country.name
  limit 1;
$$;

revoke all on function private.studio2_confirmation_country_id(text)
  from public, anon, authenticated;

-- Backfill every edition/country that already has a canonical confirmation
-- response. This makes the cutover descriptive rather than inventing new work.
with latest_submission as (
  select distinct on (submission.edition_id, resolved.country_id)
    submission.edition_id,
    resolved.country_id,
    submission.id as submission_id,
    submission.participating,
    submission.submitted_at,
    submission.updated_at
  from public.submissions submission
  cross join lateral (
    select private.studio2_confirmation_country_id(submission.country) as country_id
  ) resolved
  where resolved.country_id is not null
  order by
    submission.edition_id,
    resolved.country_id,
    coalesce(submission.updated_at, submission.submitted_at) desc,
    submission.submitted_at desc,
    submission.id desc
)
insert into public.studio2_confirmation_requirements (
  edition_id,
  country_id,
  generation,
  status,
  reason,
  valid_from,
  resolved_by_submission_id,
  resolved_at
)
select
  latest.edition_id,
  latest.country_id,
  1,
  case when latest.participating then 'satisfied' else 'waived' end,
  'Backfilled from an existing canonical confirmation response',
  least(latest.submitted_at, coalesce(latest.updated_at, latest.submitted_at)),
  latest.submission_id,
  coalesce(latest.updated_at, latest.submitted_at)
from latest_submission latest
on conflict (edition_id, country_id, generation) do nothing;

-- Some legacy canonical editions were already marked confirmed before their
-- original Confirmations response was retained. Preserve that completed state.
insert into public.studio2_confirmation_requirements (
  edition_id,
  country_id,
  generation,
  status,
  reason,
  valid_from,
  resolved_at
)
select distinct
  participant.edition_id,
  participant.country_id,
  1,
  'satisfied',
  'Backfilled from an already-confirmed canonical edition participation',
  participant.created_at,
  coalesce(participant.updated_at, participant.created_at)
from public.participants participant
where participant.show_id is null
  and participant.country_id is not null
  and participant.participation_status = 'confirmed'
  and exists (
    select 1
    from public.submission_rounds submission_round
    where submission_round.edition_id = participant.edition_id
  )
on conflict (edition_id, country_id, generation) do nothing;

-- Preserve the old personal-task population once at cutover: an active country
-- account was previously treated as needing confirmation whenever an edition
-- had confirmation rounds. Future rounds do NOT run this backfill.
insert into public.studio2_confirmation_requirements (
  edition_id,
  country_id,
  generation,
  status,
  reason,
  valid_from
)
select distinct
  submission_round.edition_id,
  account.country_id,
  1,
  'required',
  'Initial edition confirmation requirement migrated from the legacy round-driven experience',
  now()
from public.submission_rounds submission_round
join public.country_accounts account
  on account.status = 'active'
where not exists (
  select 1
  from public.studio2_confirmation_requirements existing
  where existing.edition_id = submission_round.edition_id
    and existing.country_id = account.country_id
    and existing.superseded_at is null
)
on conflict (edition_id, country_id, generation) do nothing;

create or replace function private.studio2_reconcile_confirmation_requirement(
  p_edition_id uuid,
  p_country_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_requirement public.studio2_confirmation_requirements;
  v_country public.countries;
  v_submission public.submissions;
begin
  if p_edition_id is null or p_country_id is null then
    return;
  end if;

  select *
  into v_country
  from public.countries
  where id = p_country_id;

  if v_country.id is null then
    return;
  end if;

  select *
  into v_requirement
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = p_edition_id
    and requirement.country_id = p_country_id
    and requirement.superseded_at is null
  for update;

  if v_requirement.id is not null then
    select submission.*
    into v_submission
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and (
        lower(btrim(submission.country)) = lower(btrim(v_country.name))
        or lower(btrim(submission.country)) = lower(btrim(v_country.short_code))
      )
      and coalesce(submission.updated_at, submission.submitted_at) >= v_requirement.valid_from
    order by
      coalesce(submission.updated_at, submission.submitted_at) desc,
      submission.submitted_at desc,
      submission.id desc
    limit 1;
  else
    select submission.*
    into v_submission
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and (
        lower(btrim(submission.country)) = lower(btrim(v_country.name))
        or lower(btrim(submission.country)) = lower(btrim(v_country.short_code))
      )
    order by
      coalesce(submission.updated_at, submission.submitted_at) desc,
      submission.submitted_at desc,
      submission.id desc
    limit 1;
  end if;

  if v_requirement.id is null then
    if v_submission.id is null then
      return;
    end if;

    insert into public.studio2_confirmation_requirements (
      edition_id,
      country_id,
      generation,
      status,
      reason,
      valid_from,
      resolved_by_submission_id,
      resolved_at
    )
    values (
      p_edition_id,
      p_country_id,
      1,
      case when v_submission.participating then 'satisfied' else 'waived' end,
      'Created from a canonical confirmation response',
      coalesce(v_submission.updated_at, v_submission.submitted_at),
      v_submission.id,
      coalesce(v_submission.updated_at, v_submission.submitted_at)
    )
    on conflict (edition_id, country_id, generation) do nothing;

    return;
  end if;

  if v_requirement.status = 'invalidated' then
    return;
  end if;

  if v_submission.id is not null then
    update public.studio2_confirmation_requirements
    set
      status = case when v_submission.participating then 'satisfied' else 'waived' end,
      resolved_by_submission_id = v_submission.id,
      resolved_at = coalesce(v_submission.updated_at, v_submission.submitted_at),
      updated_at = now()
    where id = v_requirement.id;
  elsif v_requirement.status in ('satisfied', 'waived')
        and v_requirement.resolved_by_submission_id is not null then
    update public.studio2_confirmation_requirements
    set
      status = 'required',
      resolved_by_submission_id = null,
      resolved_at = null,
      updated_at = now()
    where id = v_requirement.id;
  end if;
end
$$;

revoke all on function private.studio2_reconcile_confirmation_requirement(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.studio2_guard_duplicate_confirmation_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_country_id uuid;
  v_requirement_status text;
  v_requirement_generation integer;
begin
  v_country_id := private.studio2_confirmation_country_id(new.country);

  if v_country_id is null then
    return new;
  end if;

  select requirement.status, requirement.generation
  into v_requirement_status, v_requirement_generation
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = new.edition_id
    and requirement.country_id = v_country_id
    and requirement.superseded_at is null
  limit 1;

  if v_requirement_status in ('satisfied', 'waived') then
    raise exception
      'This delegation already completed confirmation requirement generation %. A new submission requires explicit reconfirmation.',
      v_requirement_generation
      using errcode = '23505';
  end if;

  return new;
end
$guard$;

revoke all on function private.studio2_guard_duplicate_confirmation_submission()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_duplicate_submission_guard
  on public.submissions;
create trigger studio2_confirmation_duplicate_submission_guard
before insert on public.submissions
for each row
execute function private.studio2_guard_duplicate_confirmation_submission();

create or replace function private.studio2_confirmation_submission_requirement_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_new_country_id uuid;
  v_old_country_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_country_id := private.studio2_confirmation_country_id(new.country);
    perform private.studio2_reconcile_confirmation_requirement(new.edition_id, v_new_country_id);
  end if;

  if tg_op <> 'INSERT' then
    v_old_country_id := private.studio2_confirmation_country_id(old.country);
    if tg_op = 'DELETE'
       or old.edition_id is distinct from new.edition_id
       or v_old_country_id is distinct from v_new_country_id then
      perform private.studio2_reconcile_confirmation_requirement(old.edition_id, v_old_country_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$$;

revoke all on function private.studio2_confirmation_submission_requirement_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_requirement_reconcile
  on public.submissions;
create trigger studio2_confirmation_requirement_reconcile
after insert or update or delete on public.submissions
for each row
execute function private.studio2_confirmation_submission_requirement_trigger();

create or replace function public.public_country_account_confirmation_requirements()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_country_id uuid;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  select account.country_id
  into v_country_id
  from public.country_accounts account
  where account.user_id = v_user
    and account.status = 'active'
  limit 1;

  if v_country_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', requirement.id,
        'edition_id', requirement.edition_id,
        'country_id', requirement.country_id,
        'generation', requirement.generation,
        'status', requirement.status,
        'reason', requirement.reason,
        'valid_from', requirement.valid_from,
        'resolved_by_submission_id', requirement.resolved_by_submission_id,
        'resolved_at', requirement.resolved_at,
        'created_at', requirement.created_at
      )
      order by edition.edition_number desc nulls last, requirement.generation desc
    )
    from public.studio2_confirmation_requirements requirement
    join public.editions edition on edition.id = requirement.edition_id
    where requirement.country_id = v_country_id
      and requirement.superseded_at is null
  ), '[]'::jsonb);
end
$$;

revoke all on function public.public_country_account_confirmation_requirements()
  from public;
grant execute on function public.public_country_account_confirmation_requirements()
  to authenticated;

create or replace function public.admin_confirmation_requirements(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', requirement.id,
        'editionId', requirement.edition_id,
        'countryId', requirement.country_id,
        'countryName', country.name,
        'countryCode', country.short_code,
        'generation', requirement.generation,
        'status', requirement.status,
        'reason', requirement.reason,
        'validFrom', requirement.valid_from,
        'resolvedBySubmissionId', requirement.resolved_by_submission_id,
        'resolvedAt', requirement.resolved_at,
        'createdAt', requirement.created_at,
        'updatedAt', requirement.updated_at
      )
      order by
        case requirement.status when 'required' then 0 when 'satisfied' then 1 when 'waived' then 2 else 3 end,
        country.name
    )
    from public.studio2_confirmation_requirements requirement
    join public.countries country on country.id = requirement.country_id
    where requirement.edition_id = p_edition_id
      and requirement.superseded_at is null
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_confirmation_requirements(uuid)
  from public, anon;
grant execute on function public.admin_confirmation_requirements(uuid)
  to authenticated, service_role;

create or replace function public.admin_confirmation_ensure_requirements(
  p_edition_id uuid,
  p_country_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_inserted integer := 0;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Valid edition id is required' using errcode = '22023';
  end if;

  with target_countries as (
    select distinct account.country_id
    from public.country_accounts account
    where account.status = 'active'
      and (p_country_ids is null or account.country_id = any(p_country_ids))
    union
    select unnest(coalesce(p_country_ids, '{}'::uuid[]))
  ),
  inserted as (
    insert into public.studio2_confirmation_requirements (
      edition_id,
      country_id,
      generation,
      status,
      reason,
      valid_from,
      created_by
    )
    select
      p_edition_id,
      target.country_id,
      1,
      'required',
      'Edition confirmation required by TSBC',
      now(),
      auth.uid()
    from target_countries target
    where target.country_id is not null
      and exists (
        select 1 from public.countries country where country.id = target.country_id
      )
      and not exists (
        select 1
        from public.studio2_confirmation_requirements requirement
        where requirement.edition_id = p_edition_id
          and requirement.country_id = target.country_id
          and requirement.superseded_at is null
      )
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  -- A historical response may already satisfy a just-created requirement.
  perform private.studio2_reconcile_confirmation_requirement(
    p_edition_id,
    target.country_id
  )
  from (
    select distinct account.country_id
    from public.country_accounts account
    where account.status = 'active'
      and (p_country_ids is null or account.country_id = any(p_country_ids))
    union
    select unnest(coalesce(p_country_ids, '{}'::uuid[]))
  ) target
  where target.country_id is not null;

  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'created', v_inserted
  );
end
$$;

revoke all on function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  from public, anon;
grant execute on function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  to authenticated, service_role;

create or replace function public.admin_confirmation_reconfirm(
  p_requirement_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_current public.studio2_confirmation_requirements;
  v_new_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
begin
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A reconfirmation reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  select *
  into v_current
  from public.studio2_confirmation_requirements requirement
  where requirement.id = p_requirement_id;

  if v_current.id is null then
    raise exception 'Confirmation requirement not found' using errcode = 'P0002';
  end if;

  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.requirement.reconfirm',
    'R2',
    jsonb_build_object(
      'requirementId', v_current.id,
      'editionId', v_current.edition_id,
      'countryId', v_current.country_id
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_current
  from public.studio2_confirmation_requirements requirement
  where requirement.id = p_requirement_id
    and requirement.superseded_at is null
  for update;

  if v_current.id is null then
    raise exception 'Current confirmation requirement not found' using errcode = 'P0002';
  end if;

  if v_current.status = 'required' then
    raise exception 'This delegation already has an unresolved confirmation requirement'
      using errcode = '23514';
  end if;

  update public.studio2_confirmation_requirements
  set
    status = 'invalidated',
    invalidated_at = now(),
    invalidated_by = auth.uid(),
    invalidated_reason = v_reason,
    superseded_at = now(),
    updated_at = now()
  where id = v_current.id;

  insert into public.studio2_confirmation_requirements (
    edition_id,
    country_id,
    generation,
    status,
    reason,
    valid_from,
    created_by
  )
  values (
    v_current.edition_id,
    v_current.country_id,
    v_current.generation + 1,
    'required',
    'Reconfirmation required: ' || v_reason,
    now(),
    auth.uid()
  )
  returning id into v_new_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'require_confirmation_again',
    'studio2_confirmation_requirements',
    v_new_id::text,
    jsonb_build_object(
      'requirementId', v_current.id,
      'generation', v_current.generation,
      'status', v_current.status
    ),
    jsonb_build_object(
      'requirementId', v_new_id,
      'generation', v_current.generation + 1,
      'status', 'required',
      'reason', v_reason
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'previousRequirementId', v_current.id,
    'requirementId', v_new_id,
    'generation', v_current.generation + 1
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$$;

revoke all on function public.admin_confirmation_reconfirm(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.admin_confirmation_reconfirm(uuid, text, uuid, text)
  to authenticated, service_role;

create or replace function public.admin_confirmation_waive_requirement(
  p_requirement_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_requirement public.studio2_confirmation_requirements;
  v_claim jsonb;
  v_operation_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
begin
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A waiver reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  select *
  into v_requirement
  from public.studio2_confirmation_requirements requirement
  where requirement.id = p_requirement_id;

  if v_requirement.id is null then
    raise exception 'Confirmation requirement not found' using errcode = 'P0002';
  end if;

  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.requirement.waive',
    'R2',
    jsonb_build_object(
      'requirementId', v_requirement.id,
      'editionId', v_requirement.edition_id,
      'countryId', v_requirement.country_id
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_requirement
  from public.studio2_confirmation_requirements requirement
  where requirement.id = p_requirement_id
    and requirement.superseded_at is null
  for update;

  if v_requirement.id is null then
    raise exception 'Current confirmation requirement not found' using errcode = 'P0002';
  end if;

  if v_requirement.status <> 'required' then
    raise exception 'Only a required confirmation can be waived' using errcode = '23514';
  end if;

  update public.studio2_confirmation_requirements
  set
    status = 'waived',
    reason = 'Waived by TSBC: ' || v_reason,
    resolved_by_submission_id = null,
    resolved_at = now(),
    updated_at = now()
  where id = v_requirement.id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'waive_confirmation_requirement',
    'studio2_confirmation_requirements',
    v_requirement.id::text,
    jsonb_build_object('status', 'required', 'generation', v_requirement.generation),
    jsonb_build_object('status', 'waived', 'generation', v_requirement.generation, 'reason', v_reason)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'requirementId', v_requirement.id,
    'status', 'waived'
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$$;

revoke all on function public.admin_confirmation_waive_requirement(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.admin_confirmation_waive_requirement(uuid, text, uuid, text)
  to authenticated, service_role;

-- Canonical Organizer Task source. A round never appears in the source key.
create or replace function private.studio2_reconcile_confirmation_requirement_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_requirement'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_confirmation_requirements requirement
      where requirement.id::text = task.source_id
        and requirement.superseded_at is null
        and requirement.status = 'required'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    requirement.edition_id,
    requirement.country_id,
    'confirmation_requirement',
    requirement.id::text,
    'confirmation-requirement:' || requirement.id::text,
    'confirmation.required',
    'confirmation.manage',
    'high',
    'open',
    country.name || ' still needs confirmation',
    'This edition-level requirement remains unresolved. Submission rounds only provide a window to satisfy it and cannot create another requirement.',
    '/confirmations/admin/requirements',
    (
      select min(submission_round.closes_at)
      from public.submission_rounds submission_round
      where submission_round.edition_id = requirement.edition_id
        and submission_round.status = 'open'
        and submission_round.closes_at > now()
    ),
    jsonb_build_object(
      'table', 'studio2_confirmation_requirements',
      'requirementId', requirement.id,
      'generation', requirement.generation,
      'resolvedWhen', 'current requirement becomes satisfied or waived'
    ),
    requirement.valid_from,
    null,
    now(),
    now()
  from public.studio2_confirmation_requirements requirement
  join public.countries country on country.id = requirement.country_id
  where requirement.superseded_at is null
    and requirement.status = 'required'
    and (p_edition_id is null or requirement.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$$;

revoke all on function private.studio2_reconcile_confirmation_requirement_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
end
$$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- HOD context: if a current requirement exists, it is more specific than the
-- downstream participant status. Explicit reconfirmation therefore immediately
-- becomes visible without mutating contest participation history.
create or replace function public.studio2_hod_context(
  p_edition_id uuid,
  p_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_context jsonb;
  v_assignment_id uuid;
  v_person_id uuid;
  v_display_name text;
  v_member_user_id uuid;
  v_created_at timestamptz;
  v_channel text;
  v_jury_members jsonb := '[]'::jsonb;
  v_assigned integer := 0;
  v_requirement_status text;
  v_requirement_id uuid;
  v_requirement_generation integer;
begin
  v_context := public.studio2_hod_context_legacy_roster(p_edition_id, p_country_id);

  select
    requirement.status,
    requirement.id,
    requirement.generation
  into
    v_requirement_status,
    v_requirement_id,
    v_requirement_generation
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = p_edition_id
    and requirement.country_id = p_country_id
    and requirement.superseded_at is null
  limit 1;

  if v_requirement_id is not null then
    v_context := v_context || jsonb_build_object(
      'confirmationComplete', v_requirement_status in ('satisfied', 'waived'),
      'confirmationRequirementId', v_requirement_id,
      'confirmationRequirementStatus', v_requirement_status,
      'confirmationRequirementGeneration', v_requirement_generation
    );
  end if;

  select
    assignment.id,
    assignment.person_id,
    person.display_name,
    account.user_id,
    assignment.created_at,
    assignment.channel
  into
    v_assignment_id,
    v_person_id,
    v_display_name,
    v_member_user_id,
    v_created_at,
    v_channel
  from public.delegation_hod_assignments assignment
  join public.delegation_people person on person.id = assignment.person_id
  left join public.country_accounts account
    on person.identity_key = 'account:' || account.user_id::text
   and account.country_id = p_country_id
   and account.status = 'active'
  where assignment.edition_id = p_edition_id
    and assignment.country_id = p_country_id
    and assignment.channel in ('jury', 'delegation')
  order by
    case when assignment.channel = 'jury' then 0 else 1 end,
    assignment.updated_at desc,
    assignment.id
  limit 1;

  if found then
    v_assigned := 1;
    v_jury_members := jsonb_build_array(
      jsonb_build_object(
        'id', v_assignment_id,
        'displayName', v_display_name,
        'memberUserId', v_member_user_id,
        'createdAt', v_created_at
      )
    );
  end if;

  return v_context || jsonb_build_object(
    'juryMembersRequired', 1,
    'juryMembersAssigned', v_assigned,
    'juryMembers', v_jury_members,
    'juryHodPersonId', v_person_id,
    'juryHodChannel', v_channel,
    'deadlines', '[]'::jsonb
  );
end
$$;

revoke all on function public.studio2_hod_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context(uuid, uuid)
  to authenticated, service_role;

comment on function public.studio2_hod_context(uuid, uuid) is
  'Studio 2 HOD workspace context. Current confirmation requirement generation overrides downstream participant status for confirmation completeness.';

notify pgrst, 'reload schema';

commit;

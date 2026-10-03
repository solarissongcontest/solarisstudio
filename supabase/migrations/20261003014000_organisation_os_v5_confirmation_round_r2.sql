begin;

-- Organisation OS V5: governed Confirmation submission-window transitions.
--
-- A submission round is only a window for satisfying edition-level
-- confirmation requirements. Opening or closing it MUST NOT create, invalidate,
-- or increment any requirement generation.

alter table public.submission_rounds
  add column if not exists operation_version bigint not null default 0
    check (operation_version >= 0);

create or replace function private.studio2_confirmation_round_version_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $round_version$
begin
  if
    (to_jsonb(new) - 'operation_version')
    is distinct from
    (to_jsonb(old) - 'operation_version')
  then
    new.operation_version := old.operation_version + 1;
  end if;

  return new;
end
$round_version$;

revoke all on function private.studio2_confirmation_round_version_before_update()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_round_version_before_update
  on public.submission_rounds;
create trigger studio2_confirmation_round_version_before_update
before update on public.submission_rounds
for each row execute function private.studio2_confirmation_round_version_before_update();

-- Response count is part of the status impact preview. Insert/delete therefore
-- invalidates an already-open impact preview for the same round.
create or replace function private.studio2_confirmation_submission_round_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $response_version$
declare
  v_old_round uuid;
  v_new_round uuid;
begin
  if tg_op = 'INSERT' then
    v_new_round := new.round_id;
  elsif tg_op = 'DELETE' then
    v_old_round := old.round_id;
  elsif new.round_id is distinct from old.round_id then
    v_old_round := old.round_id;
    v_new_round := new.round_id;
  else
    return new;
  end if;

  if v_old_round is not null then
    update public.submission_rounds
    set operation_version = operation_version + 1
    where id = v_old_round;
  end if;

  if v_new_round is not null and v_new_round is distinct from v_old_round then
    update public.submission_rounds
    set operation_version = operation_version + 1
    where id = v_new_round;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$response_version$;

revoke all on function private.studio2_confirmation_submission_round_version()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_submission_round_version
  on public.submissions;
create trigger studio2_confirmation_submission_round_version
after insert or update of round_id or delete on public.submissions
for each row execute function private.studio2_confirmation_submission_round_version();

-- Browser clients may read submission_rounds through normal policies, but every
-- Organizer mutation must go through the guarded RPC layer. Security-definer
-- Organizer RPCs and trusted service jobs do not execute as authenticated/anon.
create or replace function private.studio2_guard_confirmation_round_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception
      'Confirmation round changes must use the governed Organizer command.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_guard_confirmation_round_direct_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_confirmation_round_direct_write
  on public.submission_rounds;
create trigger studio2_guard_confirmation_round_direct_write
before insert or update or delete on public.submission_rounds
for each row execute function private.studio2_guard_confirmation_round_direct_write();

create or replace function private.studio2_confirmation_round_status_snapshot(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_round public.submission_rounds%rowtype;
  v_response_count integer := 0;
  v_required_count integer := 0;
  v_satisfied_count integer := 0;
  v_waived_count integer := 0;
  v_invalidated_count integer := 0;
  v_blockers text[] := array[]::text[];
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Confirmation round status must be open or closed'
      using errcode = '22023';
  end if;

  select *
  into v_round
  from public.submission_rounds
  where id = p_round_id;

  if not found then
    raise exception 'Confirmation round not found' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_response_count
  from public.submissions response
  where response.round_id = p_round_id;

  select
    count(*) filter (where requirement.status = 'required')::integer,
    count(*) filter (where requirement.status = 'satisfied')::integer,
    count(*) filter (where requirement.status = 'waived')::integer,
    count(*) filter (where requirement.status = 'invalidated')::integer
  into
    v_required_count,
    v_satisfied_count,
    v_waived_count,
    v_invalidated_count
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = v_round.edition_id
    and requirement.superseded_at is null;

  if p_status = 'open'
     and v_round.response_limit is not null
     and v_response_count >= v_round.response_limit then
    v_blockers := array_append(
      v_blockers,
      'Increase the response limit before reopening this full round.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'editionId', v_round.edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_round.status,
    'expectedVersion', v_round.operation_version,
    'responseCount', v_response_count,
    'responseLimit', v_round.response_limit,
    'opensAt', v_round.opens_at,
    'closesAt', v_round.closes_at,
    'requiredRequirementCount', coalesce(v_required_count, 0),
    'satisfiedRequirementCount', coalesce(v_satisfied_count, 0),
    'waivedRequirementCount', coalesce(v_waived_count, 0),
    'invalidatedRequirementCount', coalesce(v_invalidated_count, 0),
    'expiredClosingTimeWillBeCleared',
      p_status = 'open'
      and v_round.closes_at is not null
      and v_round.closes_at <= now(),
    'futureOpeningTimeWillBecomeNow',
      p_status = 'open'
      and v_round.opens_at is not null
      and v_round.opens_at > now(),
    'alreadyApplied', v_round.status = p_status,
    'blockers', to_jsonb(v_blockers)
  );
end
$snapshot$;

revoke all on function private.studio2_confirmation_round_status_snapshot(uuid, text)
  from public, anon, authenticated;

create or replace function public.admin_confirmation_round_status_preview(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage'
      using errcode = '42501';
  end if;

  return private.studio2_confirmation_round_status_snapshot(
    p_round_id,
    p_status
  );
end
$preview$;

revoke all on function public.admin_confirmation_round_status_preview(uuid, text)
  from public, anon;
grant execute on function public.admin_confirmation_round_status_preview(uuid, text)
  to authenticated;

create or replace function public.admin_confirmation_apply_round_status(
  p_round_id uuid,
  p_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_round public.submission_rounds%rowtype;
  v_snapshot jsonb;
  v_blockers jsonb;
  v_previous_status text;
  v_after_version bigint;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage'
      using errcode = '42501';
  end if;

  if p_round_id is null
     or p_operation_id is null
     or p_expected_version is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception
      'Round, operation identity and expected version are required'
      using errcode = '22023';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'Confirmation round status must be open or closed'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.round.status.change',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_round
  from public.submission_rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Confirmation round not found' using errcode = 'P0002';
  end if;

  if v_round.operation_version is distinct from p_expected_version then
    raise exception
      'Confirmation round changed since this impact preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_snapshot := private.studio2_confirmation_round_status_snapshot(
    p_round_id,
    p_status
  );
  v_blockers := coalesce(v_snapshot -> 'blockers', '[]'::jsonb);

  if jsonb_array_length(v_blockers) > 0 then
    raise exception '%', (
      select string_agg(value, ' ')
      from jsonb_array_elements_text(v_blockers)
    ) using errcode = '55000';
  end if;

  v_previous_status := v_round.status;

  if v_previous_status <> p_status then
    update public.submission_rounds
    set
      status = p_status,
      opens_at = case
        when p_status = 'open'
          and (opens_at is null or opens_at > now())
          then now()
        else opens_at
      end,
      closes_at = case
        when p_status = 'open'
          and closes_at is not null
          and closes_at <= now()
          then null
        else closes_at
      end
    where id = p_round_id;
  end if;

  select operation_version
  into v_after_version
  from public.submission_rounds
  where id = p_round_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'confirmation_round_status_change',
    'submission_rounds',
    p_round_id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'version', p_expected_version
    ),
    jsonb_build_object(
      'status', p_status,
      'version', v_after_version,
      'operationId', v_operation_id,
      'riskClass', 'R2',
      'requiredRequirementCount',
        coalesce((v_snapshot ->> 'requiredRequirementCount')::integer, 0),
      'satisfiedRequirementCount',
        coalesce((v_snapshot ->> 'satisfiedRequirementCount')::integer, 0),
      'waivedRequirementCount',
        coalesce((v_snapshot ->> 'waivedRequirementCount')::integer, 0)
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_previous_status <> p_status,
    'riskClass', 'R2',
    'roundId', p_round_id,
    'previousStatus', v_previous_status,
    'status', p_status,
    'version', v_after_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.admin_confirmation_apply_round_status(
  uuid,
  text,
  uuid,
  text,
  bigint
) from public, anon;
grant execute on function public.admin_confirmation_apply_round_status(
  uuid,
  text,
  uuid,
  text,
  bigint
) to authenticated;

-- The legacy status RPC remains service-role-only for trusted compatibility
-- jobs. Browser Organizers must use preview + apply above.
revoke execute on function public.admin_confirmation_set_round_status(uuid, text)
  from authenticated;
grant execute on function public.admin_confirmation_set_round_status(uuid, text)
  to service_role;

-- Configuration edits deliberately cannot mutate operational status anymore.
-- New rounds are always draft. Existing rounds preserve the server's current
-- status even if a stale client payload contains an older value.
create or replace function public.admin_confirmation_save_round(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_edition_id uuid := nullif(_payload ->> 'edition_id', '')::uuid;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_opens_at timestamptz := nullif(_payload ->> 'opens_at', '')::timestamptz;
  v_closes_at timestamptz := nullif(_payload ->> 'closes_at', '')::timestamptz;
  v_limit integer := nullif(_payload ->> 'response_limit', '')::integer;
  v_editing boolean := coalesce((_payload ->> 'editing_enabled')::boolean, false);
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage'
      using errcode = '42501';
  end if;

  if v_edition_id is null or v_name is null then
    raise exception 'Edition and round name are required' using errcode = '22023';
  end if;

  if v_limit is not null and v_limit < 1 then
    raise exception 'Response limit must be positive' using errcode = '22023';
  end if;

  if v_closes_at is not null
     and v_opens_at is not null
     and v_closes_at <= v_opens_at then
    raise exception 'Round closing time must be after opening time'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.submission_rounds(
      edition_id,
      name,
      status,
      opens_at,
      closes_at,
      response_limit,
      editing_enabled
    )
    values (
      v_edition_id,
      v_name,
      'draft',
      v_opens_at,
      v_closes_at,
      v_limit,
      v_editing
    )
    returning id into v_id;
  else
    update public.submission_rounds
    set
      edition_id = v_edition_id,
      name = v_name,
      opens_at = v_opens_at,
      closes_at = v_closes_at,
      response_limit = v_limit,
      editing_enabled = v_editing
    where id = v_id;

    if not found then
      raise exception 'Round not found' using errcode = 'P0002';
    end if;
  end if;

  if v_editing then
    update public.editions
    set editing_enabled = true
    where id = v_edition_id;
  end if;

  update public.submissions
  set
    editing_allowed = v_editing,
    updated_at = now()
  where round_id = v_id
    and editing_allowed is distinct from v_editing;

  return v_id;
end
$save$;

revoke all on function public.admin_confirmation_save_round(jsonb)
  from public, anon;
grant execute on function public.admin_confirmation_save_round(jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

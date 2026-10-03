begin;

-- Organisation OS V5: Confirmation submission rounds are governed R2/R3
-- operations. A round is a submission window, never the source of a new
-- edition confirmation requirement.

create table if not exists public.studio2_confirmation_round_versions (
  round_id uuid primary key references public.submission_rounds(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_confirmation_round_versions (round_id, version)
select round.id, 0
from public.submission_rounds round
on conflict (round_id) do nothing;

alter table public.studio2_confirmation_round_versions enable row level security;
revoke all on table public.studio2_confirmation_round_versions from public, anon, authenticated;
grant all on table public.studio2_confirmation_round_versions to service_role;

create or replace function private.studio2_touch_confirmation_round_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_new_round uuid;
  v_old_round uuid;
begin
  if tg_table_name = 'submission_rounds' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_new_round := new.id;
    if tg_op = 'UPDATE' then
      v_old_round := old.id;
    end if;
  elsif tg_table_name = 'submissions' then
    if tg_op <> 'DELETE' then
      v_new_round := new.round_id;
    end if;
    if tg_op <> 'INSERT' then
      v_old_round := old.round_id;
    end if;
  end if;

  if v_new_round is not null
     and exists (select 1 from public.submission_rounds r where r.id = v_new_round) then
    insert into public.studio2_confirmation_round_versions (round_id, version, updated_at)
    values (v_new_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_confirmation_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_round is not null
     and v_old_round is distinct from v_new_round
     and exists (select 1 from public.submission_rounds r where r.id = v_old_round) then
    insert into public.studio2_confirmation_round_versions (round_id, version, updated_at)
    values (v_old_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_confirmation_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_confirmation_round_version()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_round_touch_version
  on public.submission_rounds;
create trigger studio2_confirmation_round_touch_version
after insert or update on public.submission_rounds
for each row execute function private.studio2_touch_confirmation_round_version();

drop trigger if exists studio2_confirmation_submission_touch_round_version
  on public.submissions;
create trigger studio2_confirmation_submission_touch_round_version
after insert or update or delete on public.submissions
for each row execute function private.studio2_touch_confirmation_round_version();

create or replace function private.studio2_guard_direct_confirmation_round_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      raise exception
        'Confirmation rounds must be created through the Organisation OS operation contract.'
        using errcode = '42501';
    end if;

    if tg_op = 'DELETE' then
      raise exception
        'Confirmation rounds must be deleted through the Organisation OS operation contract.'
        using errcode = '42501';
    end if;

    if
      new.name is distinct from old.name
      or new.status is distinct from old.status
      or new.opens_at is distinct from old.opens_at
      or new.closes_at is distinct from old.closes_at
      or new.response_limit is distinct from old.response_limit
      or new.editing_enabled is distinct from old.editing_enabled
      or new.edition_id is distinct from old.edition_id
    then
      raise exception
        'Confirmation round changes must use the Organisation OS operation contract.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_guard_direct_confirmation_round_mutation()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_direct_confirmation_round_update
  on public.submission_rounds;
create trigger studio2_guard_direct_confirmation_round_update
before insert or update on public.submission_rounds
for each row execute function private.studio2_guard_direct_confirmation_round_mutation();

drop trigger if exists studio2_guard_direct_confirmation_round_delete
  on public.submission_rounds;
create trigger studio2_guard_direct_confirmation_round_delete
before delete on public.submission_rounds
for each row execute function private.studio2_guard_direct_confirmation_round_mutation();

create or replace function private.studio2_confirmation_round_payload(
  p_round public.submission_rounds
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $payload$
  select jsonb_build_object(
    'id', p_round.id,
    'editionId', p_round.edition_id,
    'name', p_round.name,
    'status', p_round.status,
    'opensAt', p_round.opens_at,
    'closesAt', p_round.closes_at,
    'responseLimit', p_round.response_limit,
    'editingEnabled', p_round.editing_enabled
  );
$payload$;

revoke all on function private.studio2_confirmation_round_payload(public.submission_rounds)
  from public, anon, authenticated;

create or replace function public.studio2_confirmation_round_change_preview(
  p_round_id uuid,
  p_change_kind text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_round public.submission_rounds%rowtype;
  v_edition_id uuid;
  v_version bigint := 0;
  v_response_count integer := 0;
  v_editable_response_count integer := 0;
  v_affected_responses integer := 0;
  v_requirement_count integer := 0;
  v_target_status text;
  v_target_editing boolean;
  v_name text;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
  v_limit integer;
  v_blockers jsonb := '[]'::jsonb;
  v_risk text := 'R2';
  v_already boolean := false;
  v_clear_expired_close boolean := false;
  v_move_open_to_now boolean := false;
begin
  if p_change_kind not in ('create', 'update', 'status', 'editing', 'delete') then
    raise exception 'Unknown confirmation round change kind: %', p_change_kind
      using errcode = '22023';
  end if;

  if p_change_kind = 'create' then
    v_edition_id := nullif(p_payload ->> 'editionId', '')::uuid;
    v_name := nullif(btrim(p_payload ->> 'name'), '');
    v_opens_at := nullif(p_payload ->> 'opensAt', '')::timestamptz;
    v_closes_at := nullif(p_payload ->> 'closesAt', '')::timestamptz;
    v_limit := nullif(p_payload ->> 'responseLimit', '')::integer;
    v_target_editing := coalesce((p_payload ->> 'editingEnabled')::boolean, true);

    if v_edition_id is null
       or not exists (select 1 from public.editions e where e.id = v_edition_id) then
      raise exception 'Valid edition is required' using errcode = '22023';
    end if;
    if v_name is null then
      raise exception 'Round name is required' using errcode = '22023';
    end if;

    if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
      raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
    end if;

    if v_limit is not null and v_limit < 1 then
      v_blockers := v_blockers || jsonb_build_array('Response limit must be positive.');
    end if;
    if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
      v_blockers := v_blockers || jsonb_build_array('Closing time must be after opening time.');
    end if;

    return jsonb_build_object(
      'riskClass', 'R2',
      'changeKind', p_change_kind,
      'roundId', null,
      'roundName', v_name,
      'editionId', v_edition_id,
      'expectedVersion', 0,
      'responseCount', 0,
      'affectedResponses', 0,
      'unresolvedRequirementCount', (
        select count(*)::integer
        from public.studio2_confirmation_requirements requirement
        where requirement.edition_id = v_edition_id
          and requirement.superseded_at is null
          and requirement.status = 'required'
      ),
      'targetStatus', 'draft',
      'targetEditingEnabled', v_target_editing,
      'willMoveOpeningTimeToNow', false,
      'willClearExpiredClosingTime', false,
      'requirementsCreated', 0,
      'alreadyApplied', false,
      'blockers', v_blockers
    );
  end if;

  select *
  into v_round
  from public.submission_rounds round
  where round.id = p_round_id;

  if v_round.id is null then
    raise exception 'Confirmation round not found' using errcode = 'P0002';
  end if;

  v_edition_id := v_round.edition_id;

  if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_confirmation_round_versions version_row
    where version_row.round_id = v_round.id
  ), 0)
  into v_version;

  select
    count(*)::integer,
    count(*) filter (where submission.editing_allowed)::integer
  into v_response_count, v_editable_response_count
  from public.submissions submission
  where submission.round_id = v_round.id;

  select count(*)::integer
  into v_requirement_count
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = v_edition_id
    and requirement.superseded_at is null
    and requirement.status = 'required';

  v_target_status := v_round.status;
  v_target_editing := v_round.editing_enabled;

  if p_change_kind = 'status' then
    v_target_status := nullif(p_payload ->> 'status', '');
    if v_target_status not in ('open', 'closed') then
      raise exception 'Round status change must target open or closed'
        using errcode = '22023';
    end if;

    v_already := v_round.status = v_target_status;

    if v_target_status = 'open' then
      if v_round.response_limit is not null
         and v_response_count >= v_round.response_limit then
        v_blockers := v_blockers || jsonb_build_array(
          'Increase the response limit before reopening this full round.'
        );
      end if;
      v_clear_expired_close :=
        v_round.closes_at is not null and v_round.closes_at <= now();
      v_move_open_to_now :=
        v_round.opens_at is null or v_round.opens_at > now();
    end if;
  elsif p_change_kind = 'editing' then
    if not (p_payload ? 'enabled') then
      raise exception 'Editing change requires enabled' using errcode = '22023';
    end if;
    v_target_editing := (p_payload ->> 'enabled')::boolean;
    v_already := v_round.editing_enabled = v_target_editing;
  elsif p_change_kind = 'update' then
    v_name := nullif(btrim(p_payload ->> 'name'), '');
    v_opens_at := nullif(p_payload ->> 'opensAt', '')::timestamptz;
    v_closes_at := nullif(p_payload ->> 'closesAt', '')::timestamptz;
    v_limit := nullif(p_payload ->> 'responseLimit', '')::integer;
    v_target_editing := coalesce(
      (p_payload ->> 'editingEnabled')::boolean,
      v_round.editing_enabled
    );

    if v_name is null then
      raise exception 'Round name is required' using errcode = '22023';
    end if;
    if v_limit is not null and v_limit < 1 then
      v_blockers := v_blockers || jsonb_build_array('Response limit must be positive.');
    end if;
    if v_limit is not null and v_limit < v_response_count then
      v_blockers := v_blockers || jsonb_build_array(
        'Response limit cannot be lower than the number of responses already received.'
      );
    end if;
    if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
      v_blockers := v_blockers || jsonb_build_array('Closing time must be after opening time.');
    end if;
    if v_round.status = 'open'
       and v_closes_at is not null
       and v_closes_at <= now() then
      v_blockers := v_blockers || jsonb_build_array(
        'An open round needs a future closing time or no closing time.'
      );
    end if;

    v_already :=
      v_round.name = v_name
      and v_round.opens_at is not distinct from v_opens_at
      and v_round.closes_at is not distinct from v_closes_at
      and v_round.response_limit is not distinct from v_limit
      and v_round.editing_enabled = v_target_editing;
  elsif p_change_kind = 'delete' then
    v_risk := 'R3';
    if v_response_count > 0 then
      v_blockers := v_blockers || jsonb_build_array(
        'A round with responses cannot be deleted. Keep it closed for historical integrity.'
      );
    end if;
  end if;

  if p_change_kind in ('editing', 'update') then
    select count(*)::integer
    into v_affected_responses
    from public.submissions submission
    where submission.round_id = v_round.id
      and submission.editing_allowed is distinct from v_target_editing;
  end if;

  return jsonb_build_object(
    'riskClass', v_risk,
    'changeKind', p_change_kind,
    'roundId', v_round.id,
    'roundName', v_round.name,
    'editionId', v_edition_id,
    'expectedVersion', v_version,
    'responseCount', v_response_count,
    'affectedResponses', v_affected_responses,
    'currentlyEditableResponses', v_editable_response_count,
    'unresolvedRequirementCount', v_requirement_count,
    'currentStatus', v_round.status,
    'targetStatus', v_target_status,
    'currentEditingEnabled', v_round.editing_enabled,
    'targetEditingEnabled', v_target_editing,
    'willMoveOpeningTimeToNow', v_move_open_to_now,
    'willClearExpiredClosingTime', v_clear_expired_close,
    'requirementsCreated', 0,
    'alreadyApplied', v_already,
    'blockers', v_blockers
  );
end
$preview$;

revoke all on function public.studio2_confirmation_round_change_preview(uuid, text, jsonb)
  from public, anon;
grant execute on function public.studio2_confirmation_round_change_preview(uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_round_change(
  p_round_id uuid,
  p_change_kind text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_round public.submission_rounds%rowtype;
  v_before public.submission_rounds%rowtype;
  v_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_response_count integer := 0;
  v_affected_responses integer := 0;
  v_target_status text;
  v_target_editing boolean;
  v_name text;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
  v_limit integer;
  v_new_round_id uuid;
  v_result jsonb;
  v_risk text := case when p_change_kind = 'delete' then 'R3' else 'R2' end;
begin
  if p_change_kind not in ('create', 'update', 'status', 'editing', 'delete') then
    raise exception 'Unknown confirmation round change kind: %', p_change_kind
      using errcode = '22023';
  end if;

  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected confirmation round version are required'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.round.' || p_change_kind,
    v_risk,
    jsonb_build_object(
      'roundId', p_round_id,
      'editionId', nullif(p_payload ->> 'editionId', ''),
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if p_change_kind = 'create' then
    if p_expected_version <> 0 then
      raise exception 'New confirmation round preview is stale. Refresh before continuing.'
        using errcode = '40001';
    end if;

    v_edition_id := nullif(p_payload ->> 'editionId', '')::uuid;
    v_name := nullif(btrim(p_payload ->> 'name'), '');
    v_opens_at := nullif(p_payload ->> 'opensAt', '')::timestamptz;
    v_closes_at := nullif(p_payload ->> 'closesAt', '')::timestamptz;
    v_limit := nullif(p_payload ->> 'responseLimit', '')::integer;
    v_target_editing := coalesce((p_payload ->> 'editingEnabled')::boolean, true);

    if v_edition_id is null
       or not exists (select 1 from public.editions e where e.id = v_edition_id) then
      raise exception 'Valid edition is required' using errcode = '22023';
    end if;
    if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
      raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
    end if;
    if v_name is null then
      raise exception 'Round name is required' using errcode = '22023';
    end if;
    if v_limit is not null and v_limit < 1 then
      raise exception 'Response limit must be positive' using errcode = '22023';
    end if;
    if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
      raise exception 'Round closing time must be after opening time' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('studio2-confirmation-edition:' || v_edition_id::text, 0)
    );

    insert into public.submission_rounds (
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
      v_target_editing
    )
    returning id into v_new_round_id;

    if v_target_editing then
      update public.editions
      set editing_enabled = true
      where id = v_edition_id;
    end if;

    select coalesce(version, 0)
    into v_next_version
    from public.studio2_confirmation_round_versions
    where round_id = v_new_round_id;

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
      'create_confirmation_round',
      'submission_rounds',
      v_new_round_id::text,
      null,
      jsonb_build_object(
        'roundId', v_new_round_id,
        'editionId', v_edition_id,
        'name', v_name,
        'status', 'draft',
        'opensAt', v_opens_at,
        'closesAt', v_closes_at,
        'responseLimit', v_limit,
        'editingEnabled', v_target_editing
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'riskClass', 'R2',
      'changeKind', p_change_kind,
      'roundId', v_new_round_id,
      'status', 'draft',
      'editingEnabled', v_target_editing,
      'affectedResponses', 0,
      'requirementsCreated', 0,
      'previousVersion', 0,
      'version', v_next_version,
      'operationId', v_operation_id
    );

    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-round:' || p_round_id::text, 0)
  );

  select *
  into v_round
  from public.submission_rounds round
  where round.id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Confirmation round not found' using errcode = 'P0002';
  end if;

  v_before := v_round;
  v_edition_id := v_round.edition_id;

  if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select version_row.version
  into v_current_version
  from public.studio2_confirmation_round_versions version_row
  where version_row.round_id = p_round_id
  for update;

  if not found then
    insert into public.studio2_confirmation_round_versions (
      round_id,
      version,
      updated_at
    )
    values (p_round_id, 0, now())
    on conflict (round_id) do nothing;

    select version_row.version
    into v_current_version
    from public.studio2_confirmation_round_versions version_row
    where version_row.round_id = p_round_id
    for update;
  end if;

  v_current_version := coalesce(v_current_version, 0);

  if p_expected_version <> v_current_version then
    raise exception 'Confirmation round changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  select count(*)::integer
  into v_response_count
  from public.submissions submission
  where submission.round_id = p_round_id;

  if p_change_kind = 'status' then
    v_target_status := nullif(p_payload ->> 'status', '');
    if v_target_status not in ('open', 'closed') then
      raise exception 'Round status change must target open or closed'
        using errcode = '22023';
    end if;

    if v_target_status = 'open'
       and v_round.response_limit is not null
       and v_response_count >= v_round.response_limit then
      raise exception 'Increase the response limit before reopening this full round'
        using errcode = '23514';
    end if;

    update public.submission_rounds
    set
      status = v_target_status,
      opens_at = case
        when v_target_status = 'open' and (opens_at is null or opens_at > now()) then now()
        else opens_at
      end,
      closes_at = case
        when v_target_status = 'open' and closes_at is not null and closes_at <= now() then null
        else closes_at
      end
    where id = p_round_id;
  elsif p_change_kind = 'editing' then
    if not (p_payload ? 'enabled') then
      raise exception 'Editing change requires enabled' using errcode = '22023';
    end if;
    v_target_editing := (p_payload ->> 'enabled')::boolean;

    update public.submission_rounds
    set editing_enabled = v_target_editing
    where id = p_round_id;

    if v_target_editing then
      update public.editions
      set editing_enabled = true
      where id = v_edition_id;
    end if;

    update public.submissions
    set
      editing_allowed = v_target_editing,
      updated_at = now()
    where round_id = p_round_id
      and editing_allowed is distinct from v_target_editing;

    get diagnostics v_affected_responses = row_count;
  elsif p_change_kind = 'update' then
    v_name := nullif(btrim(p_payload ->> 'name'), '');
    v_opens_at := nullif(p_payload ->> 'opensAt', '')::timestamptz;
    v_closes_at := nullif(p_payload ->> 'closesAt', '')::timestamptz;
    v_limit := nullif(p_payload ->> 'responseLimit', '')::integer;
    v_target_editing := coalesce(
      (p_payload ->> 'editingEnabled')::boolean,
      v_round.editing_enabled
    );

    if v_name is null then
      raise exception 'Round name is required' using errcode = '22023';
    end if;
    if v_limit is not null and v_limit < 1 then
      raise exception 'Response limit must be positive' using errcode = '22023';
    end if;
    if v_limit is not null and v_limit < v_response_count then
      raise exception 'Response limit cannot be lower than responses already received'
        using errcode = '23514';
    end if;
    if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
      raise exception 'Round closing time must be after opening time'
        using errcode = '22023';
    end if;
    if v_round.status = 'open'
       and v_closes_at is not null
       and v_closes_at <= now() then
      raise exception 'An open round needs a future closing time or no closing time'
        using errcode = '23514';
    end if;

    update public.submission_rounds
    set
      name = v_name,
      opens_at = v_opens_at,
      closes_at = v_closes_at,
      response_limit = v_limit,
      editing_enabled = v_target_editing
    where id = p_round_id;

    if v_target_editing then
      update public.editions
      set editing_enabled = true
      where id = v_edition_id;
    end if;

    update public.submissions
    set
      editing_allowed = v_target_editing,
      updated_at = now()
    where round_id = p_round_id
      and editing_allowed is distinct from v_target_editing;

    get diagnostics v_affected_responses = row_count;
  elsif p_change_kind = 'delete' then
    if v_response_count > 0 then
      raise exception 'A round with responses cannot be deleted. Keep it closed for historical integrity.'
        using errcode = '23514';
    end if;

    delete from public.submission_rounds
    where id = p_round_id;
  end if;

  if p_change_kind <> 'delete' then
    select *
    into v_round
    from public.submission_rounds
    where id = p_round_id;

    select coalesce(version_row.version, v_current_version)
    into v_next_version
    from public.studio2_confirmation_round_versions version_row
    where version_row.round_id = p_round_id;
  else
    v_next_version := v_current_version + 1;
  end if;

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
    'confirmation_round_' || p_change_kind,
    'submission_rounds',
    p_round_id::text,
    private.studio2_confirmation_round_payload(v_before),
    case
      when p_change_kind = 'delete' then
        jsonb_build_object(
          'deleted', true,
          'responseCount', v_response_count,
          'requirementsCreated', 0
        )
      else
        private.studio2_confirmation_round_payload(v_round)
        || jsonb_build_object(
          'affectedResponses', v_affected_responses,
          'requirementsCreated', 0
        )
    end
  );

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', v_risk,
    'changeKind', p_change_kind,
    'roundId', p_round_id,
    'status', case when p_change_kind = 'delete' then null else v_round.status end,
    'editingEnabled', case
      when p_change_kind = 'delete' then null
      else v_round.editing_enabled
    end,
    'affectedResponses', v_affected_responses,
    'requirementsCreated', 0,
    'previousVersion', v_current_version,
    'version', v_next_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_round_change(
  uuid, text, jsonb, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_round_change(
  uuid, text, jsonb, uuid, text, bigint
) to authenticated, service_role;

-- Legacy mutation RPCs remain available only to service-role integration code.
revoke execute on function public.admin_confirmation_set_round_status(uuid, text)
  from authenticated;
revoke execute on function public.admin_confirmation_set_round_editing(uuid, boolean)
  from authenticated;
revoke execute on function public.admin_confirmation_save_round(jsonb)
  from authenticated;
revoke execute on function public.admin_confirmation_delete_round(uuid)
  from authenticated;

grant execute on function public.admin_confirmation_set_round_status(uuid, text)
  to service_role;
grant execute on function public.admin_confirmation_set_round_editing(uuid, boolean)
  to service_role;
grant execute on function public.admin_confirmation_save_round(jsonb)
  to service_role;
grant execute on function public.admin_confirmation_delete_round(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;

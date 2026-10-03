begin;

-- Organisation OS V5 show publication lifecycle.
--
-- Publication is canonical operational state, not a browser-side update of
-- shows.published/publication_config. Scheduled release freezes one exact
-- intent and revalidates it at execution time.

create table if not exists public.studio2_show_publication_controls (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  state text not null default 'draft'
    check (state in ('draft', 'scheduled', 'public', 'hidden')),
  version bigint not null default 1 check (version > 0),
  frozen_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(frozen_config) = 'object'),
  scheduled_for timestamptz,
  scheduled_from_state text
    check (scheduled_from_state is null or scheduled_from_state in ('draft', 'public', 'hidden')),
  source_show_updated_at timestamptz,
  source_result_version bigint,
  scheduled_by uuid references auth.users(id) on delete set null,
  scheduled_operation_id uuid,
  last_failure text,
  last_failure_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_show_publication_schedule_consistency check (
    (state = 'scheduled'
      and scheduled_for is not null
      and scheduled_from_state is not null
      and source_show_updated_at is not null)
    or
    (state <> 'scheduled'
      and scheduled_for is null
      and scheduled_from_state is null)
  )
);

create index if not exists studio2_show_publication_controls_due_idx
  on public.studio2_show_publication_controls (scheduled_for)
  where state = 'scheduled';

create index if not exists studio2_show_publication_controls_edition_idx
  on public.studio2_show_publication_controls (edition_id, state, updated_at desc);

create table if not exists public.studio2_show_publication_executions (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  scheduled_operation_id uuid,
  status text not null check (status in ('succeeded', 'blocked')),
  intended_config jsonb not null check (jsonb_typeof(intended_config) = 'object'),
  source_show_updated_at timestamptz,
  source_result_version bigint,
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks) = 'object'),
  failure_reason text,
  executed_at timestamptz not null default now()
);

create index if not exists studio2_show_publication_executions_show_idx
  on public.studio2_show_publication_executions (show_id, executed_at desc);

alter table public.studio2_show_publication_controls enable row level security;
alter table public.studio2_show_publication_executions enable row level security;
revoke all on table public.studio2_show_publication_controls
  from public, anon, authenticated;
revoke all on table public.studio2_show_publication_executions
  from public, anon, authenticated;
grant all on table public.studio2_show_publication_controls to service_role;
grant all on table public.studio2_show_publication_executions to service_role;

create or replace function private.studio2_normalise_publication_config(
  p_config jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $normalise$
declare
  v_raw jsonb := case when jsonb_typeof(p_config) = 'object' then p_config else '{}'::jsonb end;
  v_participants boolean := coalesce((v_raw ->> 'participants')::boolean, false);
  v_artists boolean := coalesce((v_raw ->> 'artists')::boolean, false);
  v_songs boolean := coalesce((v_raw ->> 'songs')::boolean, false);
  v_semi boolean := coalesce((v_raw ->> 'semi_split')::boolean, false);
  v_running boolean := coalesce((v_raw ->> 'running_order')::boolean, false);
  v_qualifiers boolean := coalesce((v_raw ->> 'qualifiers')::boolean, false);
  v_results boolean := coalesce((v_raw ->> 'results')::boolean, false);
  v_jury boolean := coalesce((v_raw ->> 'jury_results')::boolean, false);
  v_televote boolean := coalesce((v_raw ->> 'televote_results')::boolean, false);
  v_detailed boolean := coalesce((v_raw ->> 'detailed_voting')::boolean, false);
begin
  if v_artists or v_songs or v_semi or v_running or v_qualifiers
     or v_results or v_jury or v_televote or v_detailed then
    v_participants := true;
  end if;

  if v_semi or v_running or v_qualifiers or v_results or v_detailed then
    v_artists := true;
    v_songs := true;
  end if;

  if v_qualifiers then
    v_semi := true;
  end if;

  if v_jury or v_televote or v_detailed then
    v_results := true;
  end if;

  if v_detailed then
    v_jury := true;
    v_televote := true;
  end if;

  return jsonb_build_object(
    'participants', v_participants,
    'artists', v_artists,
    'songs', v_songs,
    'semi_split', v_semi,
    'running_order', v_running,
    'qualifiers', v_qualifiers,
    'results', v_results,
    'jury_results', v_jury,
    'televote_results', v_televote,
    'detailed_voting', v_detailed
  );
end
$normalise$;

revoke all on function private.studio2_normalise_publication_config(jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_publication_has_any(
  p_config jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog, private
as $has_any$
  select exists (
    select 1
    from jsonb_each_text(private.studio2_normalise_publication_config(p_config)) item
    where item.value = 'true'
  );
$has_any$;

revoke all on function private.studio2_publication_has_any(jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_publication_has_outcomes(
  p_config jsonb
)
returns boolean
language sql
immutable
set search_path = pg_catalog, private
as $has_outcomes$
  select
    coalesce((private.studio2_normalise_publication_config(p_config) ->> 'qualifiers')::boolean, false)
    or coalesce((private.studio2_normalise_publication_config(p_config) ->> 'results')::boolean, false)
    or coalesce((private.studio2_normalise_publication_config(p_config) ->> 'jury_results')::boolean, false)
    or coalesce((private.studio2_normalise_publication_config(p_config) ->> 'televote_results')::boolean, false)
    or coalesce((private.studio2_normalise_publication_config(p_config) ->> 'detailed_voting')::boolean, false);
$has_outcomes$;

revoke all on function private.studio2_publication_has_outcomes(jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_result_release_ready(
  p_show_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  select exists (
    select 1
    from public.studio2_result_operations operation
    where operation.show_id = p_show_id
      and operation.calculation_version > 0
      and operation.reviewed_version = operation.calculation_version
      and operation.locked_version = operation.calculation_version
      and operation.reveal_ready_version = operation.calculation_version
  );
$ready$;

revoke all on function private.studio2_result_release_ready(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_publication_integrity_clear(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $clear$
  select not exists (
    select 1
    from public.studio2_incidents incident
    where incident.edition_id = p_edition_id
      and incident.status <> 'resolved'
      and incident.severity in ('sev1', 'sev2')
      and incident.category in ('integrity', 'security', 'results', 'publication')
  );
$clear$;

revoke all on function private.studio2_publication_integrity_clear(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_show_publication_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select case p_from
    when 'draft' then p_to in ('scheduled', 'public')
    when 'scheduled' then p_to in ('draft', 'public', 'hidden')
    when 'public' then p_to in ('scheduled', 'hidden')
    when 'hidden' then p_to in ('draft', 'scheduled', 'public')
    else false
  end;
$allowed$;

revoke all on function private.studio2_show_publication_transition_allowed(text, text)
  from public, anon, authenticated;

insert into public.studio2_show_publication_controls (
  show_id,
  edition_id,
  state,
  frozen_config,
  source_show_updated_at
)
select
  show.id,
  show.edition_id,
  case
    when show.published
      and private.studio2_publication_has_any(show.publication_config)
    then 'public'
    else 'draft'
  end,
  private.studio2_normalise_publication_config(show.publication_config),
  show.updated_at
from public.shows show
on conflict (show_id) do nothing;

create or replace function private.studio2_create_show_publication_control()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bootstrap$
begin
  insert into public.studio2_show_publication_controls (
    show_id,
    edition_id,
    state,
    frozen_config,
    source_show_updated_at
  )
  values (
    new.id,
    new.edition_id,
    case
      when new.published
        and private.studio2_publication_has_any(new.publication_config)
      then 'public'
      else 'draft'
    end,
    private.studio2_normalise_publication_config(new.publication_config),
    new.updated_at
  )
  on conflict (show_id) do nothing;

  return new;
end
$bootstrap$;

revoke all on function private.studio2_create_show_publication_control()
  from public, anon, authenticated;

drop trigger if exists studio2_create_show_publication_control on public.shows;
create trigger studio2_create_show_publication_control
after insert on public.shows
for each row execute function private.studio2_create_show_publication_control();

create or replace function private.studio2_ensure_show_publication_control(
  p_show_id uuid
)
returns public.studio2_show_publication_controls
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $ensure$
declare
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
begin
  select *
  into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  insert into public.studio2_show_publication_controls (
    show_id,
    edition_id,
    state,
    frozen_config,
    source_show_updated_at
  )
  values (
    v_show.id,
    v_show.edition_id,
    case
      when v_show.published
        and private.studio2_publication_has_any(v_show.publication_config)
      then 'public'
      else 'draft'
    end,
    private.studio2_normalise_publication_config(v_show.publication_config),
    v_show.updated_at
  )
  on conflict (show_id) do nothing;

  select *
  into v_control
  from public.studio2_show_publication_controls
  where show_id = p_show_id;

  return v_control;
end
$ensure$;

revoke all on function private.studio2_ensure_show_publication_control(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_guard_direct_show_publication_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Show publication must use the Organisation OS V5 publication operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_guard_direct_show_publication_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_direct_show_publication_write on public.shows;
create trigger studio2_guard_direct_show_publication_write
before update of published, publication_config
on public.shows
for each row
execute function private.studio2_guard_direct_show_publication_write();

create or replace function public.studio2_show_publication_snapshot(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_result jsonb;
begin
  if not public.studio2_access_allowed('publishing.read', p_edition_id, false)
     and not public.studio2_access_allowed('publishing.manage', p_edition_id, false)
     and not public.studio2_access_allowed('publishing.publish', p_edition_id, false) then
    raise exception 'Publishing read capability required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'showId', control.show_id,
        'editionId', control.edition_id,
        'state', control.state,
        'version', control.version,
        'frozenConfig', control.frozen_config,
        'scheduledFor', control.scheduled_for,
        'scheduledFromState', control.scheduled_from_state,
        'sourceShowUpdatedAt', control.source_show_updated_at,
        'sourceResultVersion', control.source_result_version,
        'scheduledBy', control.scheduled_by,
        'scheduledOperationId', control.scheduled_operation_id,
        'lastFailure', control.last_failure,
        'lastFailureAt', control.last_failure_at,
        'updatedAt', control.updated_at
      )
      order by show.sort_order, show.name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.studio2_show_publication_controls control
  join public.shows show on show.id = control.show_id
  where control.edition_id = p_edition_id;

  return v_result;
end
$snapshot$;

revoke all on function public.studio2_show_publication_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_show_publication_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_show_publication_change_preview(
  p_show_id uuid,
  p_target_state text,
  p_config jsonb,
  p_scheduled_for timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
  v_target text := lower(btrim(coalesce(p_target_state, '')));
  v_config jsonb;
  v_outcomes boolean;
  v_result_version bigint;
  v_risk text;
begin
  select *
  into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  select *
  into v_control
  from public.studio2_show_publication_controls
  where show_id = p_show_id;

  if v_control.show_id is null then
    raise exception 'Publication control not found for show' using errcode = 'P0002';
  end if;

  if v_target not in ('draft', 'scheduled', 'public', 'hidden') then
    raise exception 'Unknown publication state' using errcode = '22023';
  end if;

  if v_control.state = v_target and v_target <> 'scheduled' then
    return jsonb_build_object(
      'showId', v_show.id,
      'editionId', v_show.edition_id,
      'currentState', v_control.state,
      'targetState', v_target,
      'expectedVersion', v_control.version,
      'alreadyApplied', true,
      'riskClass', 'R2',
      'config', v_control.frozen_config,
      'sourceShowUpdatedAt', v_show.updated_at,
      'sourceResultVersion', v_control.source_result_version
    );
  end if;

  if not private.studio2_show_publication_transition_allowed(v_control.state, v_target) then
    raise exception 'Invalid publication transition: % -> %', v_control.state, v_target
      using errcode = '23514';
  end if;

  if v_target in ('public', 'scheduled') then
    if not public.studio2_access_allowed('publishing.publish', v_show.edition_id, false) then
      raise exception 'Publishing release capability required' using errcode = '42501';
    end if;
  elsif not public.studio2_access_allowed('publishing.manage', v_show.edition_id, false) then
    raise exception 'Publishing management capability required' using errcode = '42501';
  end if;

  v_config := case
    when v_target = 'hidden'
      then private.studio2_normalise_publication_config(v_control.frozen_config)
    else private.studio2_normalise_publication_config(p_config)
  end;

  if v_target in ('public', 'scheduled')
     and not private.studio2_publication_has_any(v_config) then
    raise exception 'Public or scheduled publication requires at least one visible layer'
      using errcode = '22023';
  end if;

  if v_target = 'scheduled' then
    if p_scheduled_for is null or p_scheduled_for <= now() + interval '30 seconds' then
      raise exception 'Scheduled publication must be in the future'
        using errcode = '22023';
    end if;
  elsif p_scheduled_for is not null then
    raise exception 'Only Scheduled publication accepts a scheduled time'
      using errcode = '22023';
  end if;

  v_outcomes := private.studio2_publication_has_outcomes(v_config);

  select calculation_version
  into v_result_version
  from public.studio2_result_operations
  where show_id = v_show.id;

  if v_target in ('public', 'scheduled') and v_outcomes then
    if not private.studio2_result_release_ready(v_show.id) then
      raise exception
        'Outcome publication requires the exact current result calculation to be reviewed, locked and reveal ready.'
        using errcode = '23514';
    end if;
  end if;

  if v_target in ('public', 'scheduled')
     and not private.studio2_publication_integrity_clear(v_show.edition_id) then
    raise exception 'Blocking integrity or publication incident prevents public release'
      using errcode = '23514';
  end if;

  v_risk := case
    when v_target in ('public', 'scheduled') and v_outcomes then 'R3'
    else 'R2'
  end;

  return jsonb_build_object(
    'showId', v_show.id,
    'editionId', v_show.edition_id,
    'currentState', v_control.state,
    'targetState', v_target,
    'expectedVersion', v_control.version,
    'alreadyApplied', false,
    'riskClass', v_risk,
    'config', v_config,
    'scheduledFor', p_scheduled_for,
    'sourceShowUpdatedAt', v_show.updated_at,
    'sourceResultVersion', case when v_outcomes then coalesce(v_result_version, 0) else null end,
    'hasOutcomes', v_outcomes,
    'resultReleaseReady', case when v_outcomes then private.studio2_result_release_ready(v_show.id) else true end,
    'integrityClear', private.studio2_publication_integrity_clear(v_show.edition_id)
  );
end
$preview$;

revoke all on function public.studio2_show_publication_change_preview(
  uuid, text, jsonb, timestamptz
) from public, anon;
grant execute on function public.studio2_show_publication_change_preview(
  uuid, text, jsonb, timestamptz
) to authenticated, service_role;

create or replace function public.studio2_apply_show_publication_change(
  p_show_id uuid,
  p_target_state text,
  p_config jsonb,
  p_scheduled_for timestamptz,
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
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
  v_preview jsonb;
  v_target text := lower(btrim(coalesce(p_target_state, '')));
  v_claim jsonb;
  v_operation_id uuid;
  v_auth_evidence jsonb;
  v_result jsonb;
  v_from text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_show
  from public.shows
  where id = p_show_id
  for update;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  perform private.studio2_ensure_show_publication_control(p_show_id);

  select *
  into v_control
  from public.studio2_show_publication_controls
  where show_id = p_show_id
  for update;

  if v_control.version is distinct from p_expected_version then
    raise exception 'Publication changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_preview := public.studio2_show_publication_change_preview(
    p_show_id,
    v_target,
    p_config,
    p_scheduled_for
  );

  if coalesce((v_preview ->> 'alreadyApplied')::boolean, false) then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'showId', p_show_id,
      'state', v_control.state,
      'version', v_control.version
    );
  end if;

  if v_preview ->> 'riskClass' = 'R3' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;

  v_from := v_control.state;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'publication.show.change',
    v_preview ->> 'riskClass',
    jsonb_build_object(
      'showId', p_show_id,
      'fromState', v_from,
      'targetState', v_target,
      'expectedVersion', p_expected_version,
      'sourceShowUpdatedAt', v_preview ->> 'sourceShowUpdatedAt',
      'sourceResultVersion', v_preview -> 'sourceResultVersion'
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_target = 'scheduled' then
    update public.studio2_show_publication_controls
    set
      state = 'scheduled',
      version = version + 1,
      frozen_config = v_preview -> 'config',
      scheduled_for = (v_preview ->> 'scheduledFor')::timestamptz,
      scheduled_from_state = v_from,
      source_show_updated_at = (v_preview ->> 'sourceShowUpdatedAt')::timestamptz,
      source_result_version = nullif(v_preview ->> 'sourceResultVersion', '')::bigint,
      scheduled_by = v_actor,
      scheduled_operation_id = v_operation_id,
      last_failure = null,
      last_failure_at = null,
      updated_by = v_actor,
      updated_at = now()
    where show_id = p_show_id
    returning * into v_control;
  elsif v_target = 'public' then
    update public.shows
    set
      publication_config = v_preview -> 'config',
      published = true,
      updated_at = now()
    where id = p_show_id
    returning * into v_show;

    update public.studio2_show_publication_controls
    set
      state = 'public',
      version = version + 1,
      frozen_config = v_preview -> 'config',
      scheduled_for = null,
      scheduled_from_state = null,
      source_show_updated_at = v_show.updated_at,
      source_result_version = nullif(v_preview ->> 'sourceResultVersion', '')::bigint,
      scheduled_by = null,
      scheduled_operation_id = null,
      last_failure = null,
      last_failure_at = null,
      updated_by = v_actor,
      updated_at = now()
    where show_id = p_show_id
    returning * into v_control;
  elsif v_target in ('hidden', 'draft') then
    update public.shows
    set
      publication_config = case
        when v_target = 'draft' then v_preview -> 'config'
        else publication_config
      end,
      published = false,
      updated_at = now()
    where id = p_show_id
    returning * into v_show;

    update public.studio2_show_publication_controls
    set
      state = v_target,
      version = version + 1,
      frozen_config = case
        when v_target = 'draft' then v_preview -> 'config'
        else frozen_config
      end,
      scheduled_for = null,
      scheduled_from_state = null,
      source_show_updated_at = v_show.updated_at,
      source_result_version = null,
      scheduled_by = null,
      scheduled_operation_id = null,
      last_failure = null,
      last_failure_at = null,
      updated_by = v_actor,
      updated_at = now()
    where show_id = p_show_id
    returning * into v_control;
  end if;

  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'publication_schedule'
    and task.source_id = p_show_id::text
    and task.state <> 'resolved';

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
    'show_publication_state_changed',
    'studio2_show_publication_controls',
    p_show_id::text,
    jsonb_build_object('state', v_from, 'version', p_expected_version),
    jsonb_build_object(
      'state', v_control.state,
      'version', v_control.version,
      'scheduledFor', v_control.scheduled_for,
      'config', v_control.frozen_config
    )
  );

  if v_auth_evidence is not null then
    update public.studio2_operation_receipts
    set
      actor_session_id = v_auth_evidence ->> 'sessionId',
      auth_freshness_evidence = v_auth_evidence,
      updated_at = now()
    where operation_id = v_operation_id
      and actor_id = v_actor;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'showId', p_show_id,
    'state', v_control.state,
    'version', v_control.version,
    'scheduledFor', v_control.scheduled_for,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_show_publication_change(
  uuid, text, jsonb, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_show_publication_change(
  uuid, text, jsonb, timestamptz, uuid, text, bigint
) to authenticated, service_role;

create or replace function public.studio2_publish_due_show_publications()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $publish_due$
declare
  v_control public.studio2_show_publication_controls;
  v_show public.shows;
  v_current_result_version bigint;
  v_failure text;
  v_checks jsonb;
  v_count integer := 0;
  v_slug text;
begin
  for v_control in
    select *
    from public.studio2_show_publication_controls
    where state = 'scheduled'
      and scheduled_for is not null
      and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
  loop
    v_failure := null;

    select *
    into v_show
    from public.shows
    where id = v_control.show_id
    for update;

    select calculation_version
    into v_current_result_version
    from public.studio2_result_operations
    where show_id = v_control.show_id;

    v_checks := jsonb_build_object(
      'showExists', v_show.id is not null,
      'showVersionMatches',
        v_show.id is not null
        and v_show.updated_at is not distinct from v_control.source_show_updated_at,
      'permissionStillValid',
        v_control.scheduled_by is not null
        and private.studio2_user_has_capability(
          v_control.scheduled_by,
          'publishing.publish',
          v_control.edition_id
        ),
      'platformAllowsPublication',
        coalesce(private.studio2_platform_mutation_allowed('publication.show.execute'), false),
      'integrityClear',
        private.studio2_publication_integrity_clear(v_control.edition_id),
      'resultVersionMatches',
        case
          when private.studio2_publication_has_outcomes(v_control.frozen_config)
          then coalesce(v_current_result_version, 0)
            is not distinct from coalesce(v_control.source_result_version, 0)
          else true
        end,
      'resultReleaseReady',
        case
          when private.studio2_publication_has_outcomes(v_control.frozen_config)
          then private.studio2_result_release_ready(v_control.show_id)
          else true
        end
    );

    if not coalesce((v_checks ->> 'showExists')::boolean, false) then
      v_failure := 'The scheduled show no longer exists.';
    elsif not coalesce((v_checks ->> 'showVersionMatches')::boolean, false) then
      v_failure := 'The show changed after publication was scheduled.';
    elsif not coalesce((v_checks ->> 'permissionStillValid')::boolean, false) then
      v_failure := 'The scheduling organizer no longer has publication permission.';
    elsif not coalesce((v_checks ->> 'platformAllowsPublication')::boolean, false) then
      v_failure := 'The current platform operational mode blocks publication.';
    elsif not coalesce((v_checks ->> 'integrityClear')::boolean, false) then
      v_failure := 'A blocking integrity, security, results or publication incident is open.';
    elsif not coalesce((v_checks ->> 'resultVersionMatches')::boolean, false) then
      v_failure := 'The result calculation version changed after publication was scheduled.';
    elsif not coalesce((v_checks ->> 'resultReleaseReady')::boolean, false) then
      v_failure := 'The exact scheduled result version is no longer reviewed, locked and reveal ready.';
    end if;

    if v_failure is null then
      update public.shows
      set
        publication_config = v_control.frozen_config,
        published = true,
        updated_at = now()
      where id = v_control.show_id
      returning * into v_show;

      update public.studio2_show_publication_controls
      set
        state = 'public',
        version = version + 1,
        scheduled_for = null,
        scheduled_from_state = null,
        source_show_updated_at = v_show.updated_at,
        scheduled_by = null,
        scheduled_operation_id = null,
        last_failure = null,
        last_failure_at = null,
        updated_at = now()
      where show_id = v_control.show_id;

      update public.studio2_organizer_tasks task
      set
        state = 'resolved',
        resolved_at = coalesce(task.resolved_at, now()),
        last_evaluated_at = now(),
        updated_at = now()
      where task.source_kind = 'publication_schedule'
        and task.source_id = v_control.show_id::text
        and task.state <> 'resolved';

      insert into public.studio2_show_publication_executions (
        show_id,
        edition_id,
        scheduled_operation_id,
        status,
        intended_config,
        source_show_updated_at,
        source_result_version,
        checks
      )
      values (
        v_control.show_id,
        v_control.edition_id,
        v_control.scheduled_operation_id,
        'succeeded',
        v_control.frozen_config,
        v_control.source_show_updated_at,
        v_control.source_result_version,
        v_checks
      );

      v_count := v_count + 1;
    else
      update public.studio2_show_publication_controls
      set
        state = coalesce(v_control.scheduled_from_state, 'draft'),
        version = version + 1,
        scheduled_for = null,
        scheduled_from_state = null,
        scheduled_by = null,
        scheduled_operation_id = null,
        last_failure = v_failure,
        last_failure_at = now(),
        updated_at = now()
      where show_id = v_control.show_id;

      insert into public.studio2_show_publication_executions (
        show_id,
        edition_id,
        status,
        intended_config,
        source_show_updated_at,
        source_result_version,
        checks,
        failure_reason
      )
      values (
        v_control.show_id,
        v_control.edition_id,
        v_control.scheduled_operation_id,
        'blocked',
        v_control.frozen_config,
        v_control.source_show_updated_at,
        v_control.source_result_version,
        v_checks,
        v_failure
      );

      select edition.slug
      into v_slug
      from public.editions edition
      where edition.id = v_control.edition_id;

      insert into public.studio2_organizer_tasks (
        edition_id,
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
        resolution_predicate,
        opened_at,
        resolved_at,
        last_evaluated_at,
        updated_at
      )
      values (
        v_control.edition_id,
        'publication_schedule',
        v_control.show_id::text,
        'publication-schedule:' || v_control.show_id::text,
        'publication.failed',
        'publishing.manage',
        'high',
        'open',
        'Scheduled publication blocked · ' || coalesce(v_show.name, 'Show'),
        v_failure,
        '/admin/publication/' || coalesce(v_slug, ''),
        jsonb_build_object(
          'table', 'studio2_show_publication_controls',
          'showId', v_control.show_id,
          'resolvedWhen', jsonb_build_array('rescheduled', 'published', 'dismissed-by-new-state')
        ),
        now(),
        null,
        now(),
        now()
      )
      on conflict (source_key) do update set
        edition_id = excluded.edition_id,
        priority = excluded.priority,
        state = 'open',
        title = excluded.title,
        description = excluded.description,
        href = excluded.href,
        resolution_predicate = excluded.resolution_predicate,
        resolved_at = null,
        last_evaluated_at = now(),
        updated_at = now();
    end if;
  end loop;

  if v_count > 0 then
    perform private.studio2_sync_task_notifications(null);
  else
    -- Blocked schedules can also create Tasks, so projection refresh is still
    -- required even when no publication succeeded.
    perform private.studio2_sync_task_notifications(null);
  end if;

  return v_count;
end
$publish_due$;

revoke all on function public.studio2_publish_due_show_publications()
  from public, anon, authenticated;
grant execute on function public.studio2_publish_due_show_publications()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $cron$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'solaris-studio2-publish-due-shows'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'solaris-studio2-publish-due-shows',
      '* * * * *',
      'select public.studio2_publish_due_show_publications();'
    );
  end if;
end
$cron$;

notify pgrst, 'reload schema';

commit;

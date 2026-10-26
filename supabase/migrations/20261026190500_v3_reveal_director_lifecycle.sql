begin;

-- Solaris Studio V3 / Worker 8: governed Reveal Director lifecycle.
--
-- Reveal execution belongs to the live-show domain. Results remains the
-- authoritative owner of calculation/review/lock/reveal-readiness; this slice
-- only binds an Armed reveal to the exact already-locked reveal-ready result
-- version and never recalculates or publishes Results.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.reveal-director-lifecycle',
  1,
  'forward_fix_only',
  false,
  'show_id',
  'Adds persistent versioned Planning/Rehearsal/Armed/Live/Complete reveal authority, explicit disarm, replay-safe execution and bounded public progress without duplicating Results calculation or publication truth.'
)
on conflict (migration_key) do nothing;

create table if not exists public.studio2_reveal_runtime (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  state text not null default 'planning'
    check (state in ('planning', 'rehearsal', 'armed', 'live', 'complete')),
  version bigint not null default 1 check (version >= 1),
  strategy text not null default 'jury_order'
    check (strategy in ('jury_order', 'final_rank_reverse', 'televote_ascending')),
  sequence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sequence) = 'array')
    check (
      case when jsonb_typeof(sequence) = 'array'
        then jsonb_array_length(sequence) <= 100
        else false
      end
    ),
  locked_result_version bigint check (locked_result_version is null or locked_result_version >= 1),
  current_step integer not null default 0 check (current_step >= 0),
  armed_at timestamptz,
  armed_by uuid references auth.users(id) on delete set null,
  live_at timestamptz,
  live_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint studio2_reveal_runtime_locked_state_check check (
    (state in ('planning', 'rehearsal') and locked_result_version is null)
    or
    (state in ('armed', 'live', 'complete') and locked_result_version is not null)
  ),
  constraint studio2_reveal_runtime_step_check check (
    case when jsonb_typeof(sequence) = 'array'
      then current_step <= jsonb_array_length(sequence)
      else false
    end
  ),
  constraint studio2_reveal_runtime_complete_check check (
    state <> 'complete' or current_step = jsonb_array_length(sequence)
  )
);

create index if not exists studio2_reveal_runtime_edition_idx
  on public.studio2_reveal_runtime (edition_id, updated_at desc);

alter table public.studio2_reveal_runtime enable row level security;
revoke all on table public.studio2_reveal_runtime from public, anon, authenticated;

create or replace function private.v3_reveal_runtime_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_edition_id uuid;
begin
  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_edition_id is null or v_edition_id is distinct from new.edition_id then
    raise exception using
      errcode = '23514',
      message = 'Reveal runtime show and edition scope disagree.';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.state is distinct from old.state
       or new.strategy is distinct from old.strategy
       or new.sequence is distinct from old.sequence
       or new.locked_result_version is distinct from old.locked_result_version
       or new.current_step is distinct from old.current_step
     )
     and coalesce(current_setting('solaris.v3_reveal_command', true), '') <> 'allowed' then
    raise exception using
      errcode = '42501',
      message = 'Reveal lifecycle changes must use the canonical V3 reveal command.';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_reveal_runtime_scope_guard()
  from public, anon, authenticated;

drop trigger if exists v3_reveal_runtime_scope_guard on public.studio2_reveal_runtime;
create trigger v3_reveal_runtime_scope_guard
before insert or update on public.studio2_reveal_runtime
for each row execute function private.v3_reveal_runtime_scope_guard();

create or replace function private.v3_seed_reveal_runtime()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $seed$
begin
  insert into public.studio2_reveal_runtime (show_id, edition_id)
  values (new.id, new.edition_id)
  on conflict (show_id) do nothing;
  return new;
end
$seed$;

revoke all on function private.v3_seed_reveal_runtime()
  from public, anon, authenticated;

drop trigger if exists v3_seed_reveal_runtime on public.shows;
create trigger v3_seed_reveal_runtime
after insert on public.shows
for each row execute function private.v3_seed_reveal_runtime();

insert into public.studio2_reveal_runtime (show_id, edition_id)
select show_row.id, show_row.edition_id
from public.shows show_row
on conflict (show_id) do nothing;

create or replace function private.v3_reveal_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $allowed$
  select case
    when p_from = 'planning' and p_to in ('rehearsal', 'armed') then true
    when p_from = 'rehearsal' and p_to in ('planning', 'armed') then true
    when p_from = 'armed' and p_to in ('rehearsal', 'live') then true
    when p_from = 'live' and p_to = 'complete' then true
    else false
  end
$allowed$;

revoke all on function private.v3_reveal_transition_allowed(text, text)
  from public, anon, authenticated;

create or replace function private.v3_validate_reveal_sequence(
  p_show_id uuid,
  p_sequence jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $validate$
declare
  v_sequence_count integer;
  v_sequence_distinct integer;
  v_result_count integer;
  v_result_identity_count integer;
begin
  if jsonb_typeof(p_sequence) <> 'array'
     or jsonb_array_length(p_sequence) < 1
     or jsonb_array_length(p_sequence) > 100 then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Reveal sequence must contain between 1 and 100 result identities.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sequence) item
    where jsonb_typeof(item) <> 'string'
       or nullif(btrim(item #>> '{}'), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Reveal sequence identities must be non-empty strings.';
  end if;

  select count(*), count(distinct identity)
  into v_sequence_count, v_sequence_distinct
  from (
    select value as identity
    from jsonb_array_elements_text(p_sequence)
  ) sequence_rows;

  if v_sequence_count <> v_sequence_distinct then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Reveal sequence cannot contain duplicate result identities.';
  end if;

  select
    count(*),
    count(distinct coalesce(result_row.contest_entity_id::text, result_row.country_id::text))
  into v_result_count, v_result_identity_count
  from public.results result_row
  where result_row.show_id = p_show_id;

  if v_result_count < 1
     or v_result_count <> v_result_identity_count
     or v_result_count <> v_sequence_count then
    raise exception using
      errcode = '55000',
      message = 'STATE_CHANGED',
      detail = 'Reveal sequence does not match one unique identity for every canonical result row.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_sequence) sequence_row(identity)
    where not exists (
      select 1
      from public.results result_row
      where result_row.show_id = p_show_id
        and coalesce(result_row.contest_entity_id::text, result_row.country_id::text) = sequence_row.identity
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'STATE_CHANGED',
      detail = 'Reveal sequence contains an identity outside the canonical result set.';
  end if;
end
$validate$;

revoke all on function private.v3_validate_reveal_sequence(uuid, jsonb)
  from public, anon, authenticated;

create or replace function private.v3_reveal_runtime_result(
  p_runtime public.studio2_reveal_runtime,
  p_operation_id uuid,
  p_previous_version bigint,
  p_replayed boolean default false,
  p_revealed_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $result$
  select jsonb_build_object(
    'operationId', p_operation_id,
    'editionId', p_runtime.edition_id,
    'showId', p_runtime.show_id,
    'state', p_runtime.state,
    'strategy', p_runtime.strategy,
    'sequence', p_runtime.sequence,
    'lockedResultVersion', p_runtime.locked_result_version,
    'currentStep', p_runtime.current_step,
    'totalSteps', jsonb_array_length(p_runtime.sequence),
    'previousVersion', p_previous_version,
    'version', p_runtime.version,
    'revealedId', p_revealed_id,
    'replayed', p_replayed,
    'updatedAt', p_runtime.updated_at
  )
$result$;

revoke all on function private.v3_reveal_runtime_result(
  public.studio2_reveal_runtime, uuid, bigint, boolean, text
) from public, anon, authenticated;

create or replace function public.studio2_reveal_director_snapshot(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $snapshot$
declare
  v_actor uuid := auth.uid();
  v_can_manage boolean;
  v_can_control boolean;
  v_rows jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not (
    public.studio2_access_allowed('results.preview', p_edition_id, false)
    or public.studio2_access_allowed('broadcast.read', p_edition_id, false)
    or public.studio2_access_allowed('broadcast.control', p_edition_id, false)
    or public.studio2_access_allowed('broadcast.manage', p_edition_id, false)
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_can_manage := public.studio2_access_allowed('broadcast.manage', p_edition_id, false);
  v_can_control := public.studio2_access_allowed('broadcast.control', p_edition_id, false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'showId', show_row.id,
    'showName', show_row.name,
    'showKind', show_row.kind,
    'sortOrder', show_row.sort_order,
    'state', runtime.state,
    'version', runtime.version,
    'strategy', runtime.strategy,
    'sequence', runtime.sequence,
    'lockedResultVersion', runtime.locked_result_version,
    'currentStep', runtime.current_step,
    'totalSteps', jsonb_array_length(runtime.sequence),
    'calculationVersion', coalesce(result_ops.calculation_version, 0),
    'revealReadyVersion', result_ops.reveal_ready_version,
    'canManagePlan', v_can_manage,
    'canControl', v_can_control,
    'updatedAt', runtime.updated_at
  ) order by show_row.sort_order, show_row.name), '[]'::jsonb)
  into v_rows
  from public.shows show_row
  join public.studio2_reveal_runtime runtime on runtime.show_id = show_row.id
  left join public.studio2_result_operations result_ops on result_ops.show_id = show_row.id
  where show_row.edition_id = p_edition_id;

  return v_rows;
end
$snapshot$;

revoke all on function public.studio2_reveal_director_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_reveal_director_snapshot(uuid)
  to authenticated;

create or replace function public.studio2_configure_reveal_v3(
  p_show_id uuid,
  p_strategy text,
  p_sequence jsonb,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $configure$
declare
  v_actor uuid := auth.uid();
  v_edition_id uuid;
  v_claim jsonb;
  v_runtime public.studio2_reveal_runtime%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_show_id is null
     or p_strategy not in ('jury_order', 'final_rank_reverse', 'televote_ascending')
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('broadcast.manage', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.reveal.configure',
    'R1',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'strategy', p_strategy,
      'sequence', p_sequence,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_reveal_runtime runtime
  where runtime.show_id = p_show_id
  for update;

  if v_runtime.show_id is null or v_runtime.edition_id is distinct from v_edition_id then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if v_runtime.version is distinct from p_expected_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;
  if v_runtime.state not in ('planning', 'rehearsal') then
    raise exception using
      errcode = 'PT409',
      message = 'STATE_CHANGED',
      detail = 'Disarm the reveal before editing its sequence.';
  end if;

  perform private.v3_validate_reveal_sequence(p_show_id, p_sequence);
  perform set_config('solaris.v3_reveal_command', 'allowed', true);

  update public.studio2_reveal_runtime
  set strategy = p_strategy,
      sequence = p_sequence,
      current_step = 0,
      locked_result_version = null,
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where show_id = p_show_id and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.show_id is null then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_result := private.v3_reveal_runtime_result(
    v_runtime, p_operation_id, p_expected_version, false, null
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  perform private.v3_emit_domain_event(
    'show.changed',
    'live-show',
    p_show_id::text,
    v_runtime.version,
    p_operation_id,
    v_edition_id,
    p_show_id,
    jsonb_build_object(
      'change', 'reveal.plan_configured',
      'state', v_runtime.state,
      'strategy', v_runtime.strategy
    )
  );
  return v_result;
end
$configure$;

revoke all on function public.studio2_configure_reveal_v3(
  uuid, text, jsonb, bigint, uuid, text
) from public, anon, authenticated;
grant execute on function public.studio2_configure_reveal_v3(
  uuid, text, jsonb, bigint, uuid, text
) to authenticated;

create or replace function public.studio2_transition_reveal_v3(
  p_show_id uuid,
  p_to text,
  p_reason text,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $transition$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_edition_id uuid;
  v_claim jsonb;
  v_runtime public.studio2_reveal_runtime%rowtype;
  v_from text;
  v_result_ops public.studio2_result_operations%rowtype;
  v_result jsonb;
  v_total integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_show_id is null
     or p_to not in ('planning', 'rehearsal', 'armed', 'live', 'complete')
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('broadcast.control', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.reveal.transition',
    'R2',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'to', p_to,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_reveal_runtime runtime
  where runtime.show_id = p_show_id
  for update;

  if v_runtime.show_id is null or v_runtime.edition_id is distinct from v_edition_id then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if v_runtime.version is distinct from p_expected_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_from := v_runtime.state;
  if not private.v3_reveal_transition_allowed(v_from, p_to) then
    raise exception using
      errcode = 'PT409',
      message = 'STATE_CHANGED',
      detail = format('Reveal cannot transition from %s to %s.', v_from, p_to);
  end if;

  if v_from = 'armed' and p_to = 'rehearsal' and v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Explicit disarm requires a reason.';
  end if;

  if p_to = 'armed' then
    perform private.v3_validate_reveal_sequence(p_show_id, v_runtime.sequence);
    select result_ops.*
    into v_result_ops
    from public.studio2_result_operations result_ops
    where result_ops.show_id = p_show_id
    for share;

    if v_result_ops.show_id is null
       or v_result_ops.calculation_version < 1
       or v_result_ops.locked_version is distinct from v_result_ops.calculation_version
       or v_result_ops.reveal_ready_version is distinct from v_result_ops.calculation_version then
      raise exception using
        errcode = 'PT409',
        message = 'STATE_CHANGED',
        detail = 'The current canonical result version must be locked and reveal ready before arming.';
    end if;
  elsif p_to in ('live', 'complete') or v_from = 'live' then
    select result_ops.*
    into v_result_ops
    from public.studio2_result_operations result_ops
    where result_ops.show_id = p_show_id
    for share;

    if v_result_ops.show_id is null
       or v_runtime.locked_result_version is distinct from v_result_ops.calculation_version
       or v_result_ops.reveal_ready_version is distinct from v_runtime.locked_result_version then
      raise exception using
        errcode = 'PT409',
        message = 'VERSION_CONFLICT',
        detail = 'Result authority changed after the reveal was armed.';
    end if;
  end if;

  v_total := jsonb_array_length(v_runtime.sequence);
  if p_to = 'complete' and v_runtime.current_step <> v_total then
    raise exception using
      errcode = 'PT409',
      message = 'STATE_CHANGED',
      detail = 'Every locked reveal step must be executed before completing the reveal.';
  end if;

  perform set_config('solaris.v3_reveal_command', 'allowed', true);
  update public.studio2_reveal_runtime
  set state = p_to,
      locked_result_version = case
        when p_to = 'armed' then v_result_ops.calculation_version
        when v_from = 'armed' and p_to = 'rehearsal' then null
        else locked_result_version
      end,
      current_step = case
        when p_to in ('planning', 'rehearsal', 'armed') then 0
        when p_to = 'complete' then v_total
        else current_step
      end,
      armed_at = case
        when p_to = 'armed' then now()
        when v_from = 'armed' and p_to = 'rehearsal' then null
        else armed_at
      end,
      armed_by = case
        when p_to = 'armed' then v_actor
        when v_from = 'armed' and p_to = 'rehearsal' then null
        else armed_by
      end,
      live_at = case when p_to = 'live' then now() else live_at end,
      live_by = case when p_to = 'live' then v_actor else live_by end,
      completed_at = case when p_to = 'complete' then now() else completed_at end,
      completed_by = case when p_to = 'complete' then v_actor else completed_by end,
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where show_id = p_show_id and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.show_id is null then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_result := private.v3_reveal_runtime_result(
    v_runtime, p_operation_id, p_expected_version, false, null
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  perform private.v3_emit_domain_event(
    'show.changed',
    'live-show',
    p_show_id::text,
    v_runtime.version,
    p_operation_id,
    v_edition_id,
    p_show_id,
    jsonb_build_object(
      'change', 'reveal.transitioned',
      'from', v_from,
      'to', p_to,
      'reason', v_reason,
      'lockedResultVersion', v_runtime.locked_result_version
    )
  );
  return v_result;
end
$transition$;

revoke all on function public.studio2_transition_reveal_v3(
  uuid, text, text, bigint, uuid, text
) from public, anon, authenticated;
grant execute on function public.studio2_transition_reveal_v3(
  uuid, text, text, bigint, uuid, text
) to authenticated;

create or replace function public.studio2_advance_reveal_v3(
  p_show_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $advance$
declare
  v_actor uuid := auth.uid();
  v_edition_id uuid;
  v_claim jsonb;
  v_runtime public.studio2_reveal_runtime%rowtype;
  v_result_ops public.studio2_result_operations%rowtype;
  v_total integer;
  v_revealed_id text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_show_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('broadcast.control', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.reveal.advance',
    'R2',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object('expectedVersion', p_expected_version)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_reveal_runtime runtime
  where runtime.show_id = p_show_id
  for update;

  if v_runtime.show_id is null or v_runtime.edition_id is distinct from v_edition_id then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if v_runtime.version is distinct from p_expected_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;
  if v_runtime.state <> 'live' then
    raise exception using errcode = 'PT409', message = 'STATE_CHANGED';
  end if;

  select result_ops.*
  into v_result_ops
  from public.studio2_result_operations result_ops
  where result_ops.show_id = p_show_id
  for share;

  if v_result_ops.show_id is null
     or v_runtime.locked_result_version is distinct from v_result_ops.calculation_version
     or v_result_ops.reveal_ready_version is distinct from v_runtime.locked_result_version then
    raise exception using
      errcode = 'PT409',
      message = 'VERSION_CONFLICT',
      detail = 'Result authority changed after the reveal was armed.';
  end if;

  v_total := jsonb_array_length(v_runtime.sequence);
  if v_runtime.current_step >= v_total then
    raise exception using
      errcode = 'PT409',
      message = 'STATE_CHANGED',
      detail = 'All reveal steps have already been executed.';
  end if;

  v_revealed_id := v_runtime.sequence ->> v_runtime.current_step;
  perform set_config('solaris.v3_reveal_command', 'allowed', true);
  update public.studio2_reveal_runtime
  set current_step = current_step + 1,
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where show_id = p_show_id and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.show_id is null then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  v_result := private.v3_reveal_runtime_result(
    v_runtime, p_operation_id, p_expected_version, false, v_revealed_id
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  perform private.v3_emit_domain_event(
    'show.cue_changed',
    'live-show',
    p_show_id::text,
    v_runtime.version,
    p_operation_id,
    v_edition_id,
    p_show_id,
    jsonb_build_object(
      'change', 'reveal.advanced',
      'currentStep', v_runtime.current_step,
      'totalSteps', v_total,
      'revealedId', v_revealed_id
    )
  );
  return v_result;
end
$advance$;

revoke all on function public.studio2_advance_reveal_v3(
  uuid, bigint, uuid, text
) from public, anon, authenticated;
grant execute on function public.studio2_advance_reveal_v3(
  uuid, bigint, uuid, text
) to authenticated;

-- Public progress is deliberately spoiler-bounded. Before Live it exposes no
-- armed plan or future sequence. During Live/Complete it exposes progress and
-- only the identity that has already been revealed, never points or future ids.
create or replace function public.studio2_public_reveal_snapshot(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $public_snapshot$
declare
  v_runtime public.studio2_reveal_runtime%rowtype;
  v_published boolean;
  v_last_revealed text;
begin
  select coalesce(show_row.published, false)
  into v_published
  from public.shows show_row
  where show_row.id = p_show_id;

  if not coalesce(v_published, false) then
    return jsonb_build_object('state', 'hidden');
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_reveal_runtime runtime
  where runtime.show_id = p_show_id;

  if v_runtime.show_id is null or v_runtime.state not in ('live', 'complete') then
    return jsonb_build_object('state', 'hidden');
  end if;

  if v_runtime.current_step > 0 then
    v_last_revealed := v_runtime.sequence ->> (v_runtime.current_step - 1);
  end if;

  return jsonb_build_object(
    'state', v_runtime.state,
    'version', v_runtime.version,
    'currentStep', v_runtime.current_step,
    'totalSteps', jsonb_array_length(v_runtime.sequence),
    'lastRevealedId', v_last_revealed,
    'updatedAt', v_runtime.updated_at
  );
end
$public_snapshot$;

revoke all on function public.studio2_public_reveal_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_public_reveal_snapshot(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;

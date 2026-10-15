begin;

-- System V3 S3 Publication invariants.
--
-- Existing public outcome rows predate versioned result evidence and are kept
-- exactly as historical observations. This migration does not invent a result
-- version for them. Any future Publication mutation must, however, bind to the
-- exact immutable result version that is current, reviewed, locked and reveal
-- ready while holding the same per-show advisory lock as Results.

-- Audit row-local lifecycle state before adding staged checks. These are
-- mechanical contradictions only; official publication history is never
-- guessed into compliance.
do $audit$
begin
  if exists (
    select 1
    from public.studio2_show_publication_controls control
    where (control.last_failure is null) <> (control.last_failure_at is null)
  ) then
    raise exception 'Publication controls contain inconsistent failure evidence';
  end if;

  if exists (
    select 1
    from public.studio2_show_publication_controls control
    where control.state = 'scheduled'
      and (control.scheduled_by is null or control.scheduled_operation_id is null)
  ) then
    raise exception 'Scheduled publication controls lack actor or operation identity';
  end if;

  if exists (
    select 1
    from public.studio2_show_publication_executions execution
    where (execution.status = 'succeeded' and execution.failure_reason is not null)
       or (execution.status = 'blocked' and execution.failure_reason is null)
       or execution.scheduled_operation_id is null
       or (
         private.studio2_publication_has_outcomes(execution.intended_config)
         and execution.source_result_version is null
       )
  ) then
    raise exception 'Publication execution history contains contradictory terminal evidence';
  end if;
end
$audit$;

alter table public.studio2_show_publication_controls
  add constraint studio2_show_publication_controls_failure_pair_v3_check
  check ((last_failure is null) = (last_failure_at is null))
  not valid;

alter table public.studio2_show_publication_controls
  add constraint studio2_show_publication_controls_schedule_owner_v3_check
  check (
    state <> 'scheduled'
    or (scheduled_by is not null and scheduled_operation_id is not null)
  )
  not valid;

alter table public.studio2_show_publication_executions
  add constraint studio2_show_publication_executions_terminal_v3_check
  check (
    (status = 'succeeded' and failure_reason is null)
    or (status = 'blocked' and failure_reason is not null)
  )
  not valid;

alter table public.studio2_show_publication_executions
  add constraint studio2_show_publication_executions_operation_v3_check
  check (scheduled_operation_id is not null)
  not valid;

alter table public.studio2_show_publication_executions
  add constraint studio2_show_publication_executions_result_version_v3_check
  check (
    not private.studio2_publication_has_outcomes(intended_config)
    or source_result_version is not null
  )
  not valid;

alter table public.studio2_show_publication_controls
  validate constraint studio2_show_publication_controls_failure_pair_v3_check;
alter table public.studio2_show_publication_controls
  validate constraint studio2_show_publication_controls_schedule_owner_v3_check;
alter table public.studio2_show_publication_executions
  validate constraint studio2_show_publication_executions_terminal_v3_check;
alter table public.studio2_show_publication_executions
  validate constraint studio2_show_publication_executions_operation_v3_check;
alter table public.studio2_show_publication_executions
  validate constraint studio2_show_publication_executions_result_version_v3_check;

-- One schedule operation has one immutable terminal execution record.
create unique index if not exists studio2_show_publication_executions_operation_v3_uidx
  on public.studio2_show_publication_executions (scheduled_operation_id)
  where scheduled_operation_id is not null;

create or replace function private.v3_publication_result_version_release_ready(
  p_show_id uuid,
  p_version bigint
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  select p_version is not null and exists (
    select 1
    from public.studio2_result_operations operation
    join private.v3_result_versions version
      on version.show_id = operation.show_id
     and version.version = p_version
     and version.edition_id = operation.edition_id
    where operation.show_id = p_show_id
      and operation.calculation_version = p_version
      and operation.last_calculated_at is not null
      and operation.reviewed_version = p_version
      and operation.reviewed_at is not null
      and operation.locked_version = p_version
      and operation.locked_at is not null
      and operation.reveal_ready_version = p_version
      and operation.reveal_ready_at is not null
  );
$ready$;

revoke all on function private.v3_publication_result_version_release_ready(uuid, bigint)
  from public, anon, authenticated;

-- Keep the mature one-argument readiness contract, but make its meaning match
-- the V3 exact-version evidence that Publication now enforces.
create or replace function private.studio2_result_release_ready(
  p_show_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  select coalesce((
    select private.v3_publication_result_version_release_ready(
      operation.show_id,
      operation.calculation_version
    )
    from public.studio2_result_operations operation
    where operation.show_id = p_show_id
  ), false);
$ready$;

revoke all on function private.studio2_result_release_ready(uuid)
  from public, anon, authenticated;

create or replace function private.v3_validate_publication_control()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_has_outcomes boolean;
  v_show_updated_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then
      raise exception 'Publication control version must advance exactly once'
        using errcode = '23514';
    end if;

    if new.state is distinct from old.state
       and not private.studio2_show_publication_transition_allowed(old.state, new.state) then
      raise exception 'Invalid publication transition: % -> %', old.state, new.state
        using errcode = '23514';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || new.show_id::text, 0)
  );

  v_has_outcomes := private.studio2_publication_has_outcomes(new.frozen_config);

  if new.state in ('scheduled', 'public') and v_has_outcomes then
    if new.source_result_version is null then
      raise exception 'Outcome publication requires an exact immutable result version'
        using errcode = '23514';
    end if;

    if not private.v3_publication_result_version_release_ready(
      new.show_id,
      new.source_result_version
    ) then
      raise exception 'Publication result version is not the exact current reviewed, locked and reveal-ready result'
        using errcode = '23514';
    end if;
  elsif new.state in ('scheduled', 'public')
        and not v_has_outcomes
        and new.source_result_version is not null then
    raise exception 'Publication without outcome layers must not claim result-version provenance'
      using errcode = '23514';
  end if;

  if new.state = 'scheduled' then
    select show.updated_at
    into v_show_updated_at
    from public.shows show
    where show.id = new.show_id;

    if v_show_updated_at is null
       or new.source_show_updated_at is distinct from v_show_updated_at then
      raise exception 'Scheduled publication must bind the exact current show version'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_validate_publication_control()
  from public, anon, authenticated;

create trigger v3_validate_publication_control
before insert or update
on public.studio2_show_publication_controls
for each row execute function private.v3_validate_publication_control();

create or replace function private.v3_reject_publication_execution_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  raise exception 'Publication execution evidence is immutable' using errcode = '55000';
end
$guard$;

revoke all on function private.v3_reject_publication_execution_mutation()
  from public, anon, authenticated;

create trigger v3_reject_publication_execution_mutation
before update or delete
on public.studio2_show_publication_executions
for each row execute function private.v3_reject_publication_execution_mutation();

-- Validate the public show projection at transaction end. Existing legacy
-- public outcome rows with NULL source_result_version are grandfathered by the
-- migration because constraint triggers do not retroactively fire. Any future
-- mutation of those publication fields must first move through the canonical
-- workflow and acquire exact V3 provenance.
create or replace function private.v3_validate_show_publication_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_show_id uuid;
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
  v_has_outcomes boolean;
begin
  if tg_table_name = 'shows' then
    v_show_id := coalesce(new.id, old.id);
  else
    v_show_id := coalesce(new.show_id, old.show_id);
  end if;

  select * into v_show
  from public.shows show
  where show.id = v_show_id;

  if v_show.id is null then
    return null;
  end if;

  select * into v_control
  from public.studio2_show_publication_controls control
  where control.show_id = v_show_id;

  if v_control.show_id is null then
    raise exception 'Show publication projection is missing its canonical control row'
      using errcode = '23503';
  end if;

  if v_control.state = 'public' then
    if not coalesce(v_show.published, false) then
      raise exception 'Public publication control requires the show public projection'
        using errcode = '23514';
    end if;

    if v_control.last_failure is null
       and private.studio2_normalise_publication_config(v_show.publication_config)
         is distinct from v_control.frozen_config then
      raise exception 'Public show projection differs from canonical publication configuration'
        using errcode = '23514';
    end if;

    v_has_outcomes := private.studio2_publication_has_outcomes(v_show.publication_config);
    if v_has_outcomes then
      if v_control.source_result_version is null
         or not private.v3_publication_result_version_release_ready(
           v_show_id,
           v_control.source_result_version
         ) then
        raise exception 'Public outcome projection lacks exact finalized result-version provenance'
          using errcode = '23514';
      end if;
    end if;

  elsif v_control.state in ('draft', 'hidden') then
    if coalesce(v_show.published, false) then
      raise exception 'Private publication control cannot leave the show public'
        using errcode = '23514';
    end if;

  elsif v_control.state = 'scheduled' then
    if coalesce(v_show.published, false)
       is distinct from (v_control.scheduled_from_state = 'public') then
      raise exception 'Scheduled publication no longer reflects its frozen source state'
        using errcode = '23514';
    end if;
  end if;

  return null;
end
$projection$;

revoke all on function private.v3_validate_show_publication_projection()
  from public, anon, authenticated;

create constraint trigger v3_validate_publication_projection_from_control
after insert or update
on public.studio2_show_publication_controls
deferrable initially deferred
for each row execute function private.v3_validate_show_publication_projection();

create constraint trigger v3_validate_publication_projection_from_show
after update of published, publication_config
on public.shows
deferrable initially deferred
for each row execute function private.v3_validate_show_publication_projection();

create constraint trigger v3_validate_publication_projection_from_results
after insert or update or delete
on public.studio2_result_operations
deferrable initially deferred
for each row execute function private.v3_validate_show_publication_projection();

commit;

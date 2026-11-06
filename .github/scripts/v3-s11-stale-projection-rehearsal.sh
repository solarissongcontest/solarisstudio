#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-stale-projection] %s\n' "$*"; }
fail() { printf '\n[v3-s11-stale-projection] FAIL: %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required"
command -v psql >/dev/null 2>&1 || fail "psql is required"

eval "$(supabase status -o env)"
: "${DB_URL:?missing local Supabase DB_URL}"

case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing hosted/non-local database rehearsal ($DB_URL)" ;;
esac

log "Injecting stale Organizer Task projection and deterministic first-repair failure on local Supabase"

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;

insert into public.editions (id, name, slug, edition_number, status, published)
values (
  '87000000-0000-4000-8000-000000000011'::uuid,
  'S11 stale projection rehearsal',
  's11-stale-projection-rehearsal',
  987011,
  'draft',
  false
)
on conflict (id) do nothing;

create temp table v3_fixture_job(job_id bigint primary key) on commit drop;
insert into v3_fixture_job(job_id)
select cron.schedule(
  'solaris-v3-s11-stale-projection-fixture',
  '0 0 1 1 *',
  'select 1'
)::bigint;

update cron.job
set active = false
where jobid = (select job_id from v3_fixture_job);

do $assert_source$
begin
  if (
    select count(*)
    from cron.job
    where jobid = (select job_id from v3_fixture_job)
      and jobname = 'solaris-v3-s11-stale-projection-fixture'
      and active = false
  ) <> 1 then
    raise exception 'Fixture canonical scheduler source was not created';
  end if;
end
$assert_source$;

select private.studio2_reconcile_all_organizer_tasks(
  '87000000-0000-4000-8000-000000000011'::uuid
);

do $assert_initial$
begin
  if (
    select count(*)
    from public.studio2_organizer_tasks task
    where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job)
      and task.source_kind = 'system_job'
      and task.task_type = 'system.job.failure'
      and task.required_capability = 'system.manage'
      and task.priority = 'critical'
      and task.state = 'open'
  ) <> 1 then
    raise exception 'Canonical rebuild did not create the expected system-job task';
  end if;
end
$assert_initial$;

create temp table v3_expected_projection(semantic jsonb not null) on commit drop;
insert into v3_expected_projection(semantic)
select jsonb_build_object(
  'sourceKind', task.source_kind,
  'sourceId', task.source_id,
  'sourceKey', task.source_key,
  'taskType', task.task_type,
  'requiredCapability', task.required_capability,
  'priority', task.priority,
  'state', task.state,
  'title', task.title,
  'description', task.description,
  'href', task.href,
  'resolutionPredicate', task.resolution_predicate
)
from public.studio2_organizer_tasks task
where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job);

-- Corrupt derived state only. The cron job remains the authoritative source.
delete from public.studio2_organizer_tasks task
where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job);

do $assert_stale$
begin
  if exists (
    select 1
    from public.studio2_organizer_tasks task
    where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job)
  ) then
    raise exception 'Fixture projection was not made stale';
  end if;
  if not exists (
    select 1
    from cron.job
    where jobid = (select job_id from v3_fixture_job)
      and active = false
  ) then
    raise exception 'Canonical source changed while corrupting projection';
  end if;
end
$assert_stale$;

-- Force the first rebuild attempt to fail at the projection write boundary. The
-- PL/pgSQL exception block is a subtransaction, so partial rebuild writes roll
-- back while canonical scheduler truth remains untouched.
create or replace function pg_temp.v3_s11_fail_fixture_projection_write()
returns trigger
language plpgsql
as $trigger$
begin
  if new.source_key = 'system-job:' || (select job_id::text from v3_fixture_job) then
    raise exception 'V3_S11_SYNTHETIC_PROJECTION_WRITE_FAILURE';
  end if;
  return new;
end
$trigger$;

create trigger v3_s11_fail_fixture_projection_write
before insert or update on public.studio2_organizer_tasks
for each row
execute function pg_temp.v3_s11_fail_fixture_projection_write();

do $expected_failure$
declare
  v_failed boolean := false;
begin
  begin
    perform private.studio2_reconcile_all_organizer_tasks(
      '87000000-0000-4000-8000-000000000011'::uuid
    );
  exception when raise_exception then
    if sqlerrm <> 'V3_S11_SYNTHETIC_PROJECTION_WRITE_FAILURE' then
      raise;
    end if;
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'Synthetic first reconciliation failure did not occur';
  end if;
end
$expected_failure$;

drop trigger v3_s11_fail_fixture_projection_write on public.studio2_organizer_tasks;

do $assert_failed_attempt_safe$
begin
  if exists (
    select 1
    from public.studio2_organizer_tasks task
    where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job)
  ) then
    raise exception 'Failed rebuild left a partial fixture projection behind';
  end if;
  if not exists (
    select 1
    from cron.job
    where jobid = (select job_id from v3_fixture_job)
      and active = false
  ) then
    raise exception 'Failed rebuild mutated canonical scheduler truth';
  end if;
end
$assert_failed_attempt_safe$;

-- Retry through the same declared canonical rebuild path.
select private.studio2_reconcile_all_organizer_tasks(
  '87000000-0000-4000-8000-000000000011'::uuid
);

do $assert_repaired$
declare
  v_actual jsonb;
  v_expected jsonb;
begin
  if (
    select count(*)
    from public.studio2_organizer_tasks task
    where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job)
  ) <> 1 then
    raise exception 'Retry did not restore exactly one fixture task';
  end if;

  select semantic into v_expected from v3_expected_projection;
  select jsonb_build_object(
    'sourceKind', task.source_kind,
    'sourceId', task.source_id,
    'sourceKey', task.source_key,
    'taskType', task.task_type,
    'requiredCapability', task.required_capability,
    'priority', task.priority,
    'state', task.state,
    'title', task.title,
    'description', task.description,
    'href', task.href,
    'resolutionPredicate', task.resolution_predicate
  )
  into v_actual
  from public.studio2_organizer_tasks task
  where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job);

  if v_actual is distinct from v_expected then
    raise exception 'Rebuilt projection does not match the pre-corruption canonical projection';
  end if;
end
$assert_repaired$;

-- Replaying reconciliation must be idempotent and must not duplicate the task.
select private.studio2_reconcile_all_organizer_tasks(
  '87000000-0000-4000-8000-000000000011'::uuid
);

do $assert_idempotent$
begin
  if (
    select count(*)
    from public.studio2_organizer_tasks task
    where task.source_key = 'system-job:' || (select job_id::text from v3_fixture_job)
      and task.state = 'open'
  ) <> 1 then
    raise exception 'Repeated reconciliation duplicated or lost the repaired task';
  end if;
end
$assert_idempotent$;

rollback;
SQL

log "PASS: stale projection rebuild and reconciliation retry converged without mutating canonical truth"

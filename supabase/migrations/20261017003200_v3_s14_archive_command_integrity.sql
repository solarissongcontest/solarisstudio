begin;

-- System V3 / S14 Archive command hardening.
--
-- The earlier archive consequence migration made studio2_edition_runtime the
-- canonical lifecycle truth and emitted the right durable consequences, but the
-- browser-facing transition still generated operation identity inside SQL. That
-- left archive without the V3 client/server contract used by other consequential
-- commands: explicit expected version, stable operation id, stable idempotency
-- key, semantic request fingerprinting, and transport reconciliation.
--
-- This migration adds an archive-specific command without rewriting the rest of
-- the established edition lifecycle surface. It also prevents the legacy v2 RPC
-- from bypassing the archive command by guarding the canonical runtime row.

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if new.state = 'archived'
     and old.state is distinct from 'archived'
     and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
    raise exception 'Archive transition must use the canonical V3 archive command.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archive_runtime_transition
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_transition
before update of state on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

create or replace function public.studio2_archive_edition_v3(
  p_edition_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $archive$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_runtime public.studio2_edition_runtime%rowtype;
  v_from text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.archive', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Claim before evaluating mutable state. An exact replay after the original
  -- transaction committed must return its original result even though the
  -- edition is already archived by then.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'edition.transition.archived',
    'R2',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'to', 'archived',
      'expectedRuntimeVersion', p_expected_version,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return v_claim -> 'result';
    end if;
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = 'Archive operation exists but is not in a replayable succeeded state.';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id
  for update;

  if v_runtime.edition_id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  if v_runtime.version is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = format(
        'Expected edition runtime version %s, current version is %s.',
        p_expected_version,
        v_runtime.version
      );
  end if;

  v_from := v_runtime.state;
  if private.studio2_transition_risk(v_from, 'archived') is distinct from 'normal' then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = format('Edition cannot transition from %s to archived.', v_from);
  end if;

  -- The guard makes the legacy browser transition path fail closed. The local
  -- transaction setting is visible only to this transaction and is required for
  -- the canonical state mutation below.
  perform set_config('solaris.v3_archive_command', 'allowed', true);

  update public.studio2_edition_runtime
  set state = 'archived',
      subsystems = private.studio2_default_subsystems('archived'),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.edition_id is null then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', 'archived',
      'risk', 'normal',
      'reason', v_reason,
      'operationId', p_operation_id,
      'runtimeVersion', v_runtime.version
    )
  );

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'edition.archived',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', 'archived',
      'operationId', p_operation_id,
      'runtimeVersion', v_runtime.version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'editionId', p_edition_id,
    'from', v_from,
    'state', v_runtime.state,
    'runtimeVersion', v_runtime.version,
    'runtime', to_jsonb(v_runtime)
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);

  perform private.v3_emit_domain_event(
    'edition.archived',
    'edition',
    p_edition_id::text,
    v_runtime.version,
    p_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'from', v_from,
      'to', 'archived',
      'runtimeVersion', v_runtime.version,
      'legacyStatus', (
        select edition.status
        from public.editions edition
        where edition.id = p_edition_id
      ),
      'lifecycleAuthority', 'studio2_edition_runtime'
    ),
    1,
    array['edition.tasks']::text[]
  );

  return v_result;
end
$archive$;

revoke all on function public.studio2_archive_edition_v3(
  uuid, bigint, uuid, text, text
) from public, anon;
grant execute on function public.studio2_archive_edition_v3(
  uuid, bigint, uuid, text, text
) to authenticated, service_role;

comment on function public.studio2_archive_edition_v3(uuid, bigint, uuid, text, text) is
  'Canonical V3 archive command. Requires expected runtime version plus stable operation/idempotency identity and emits the archive DomainEvent/outbox consequence.';

notify pgrst, 'reload schema';

commit;

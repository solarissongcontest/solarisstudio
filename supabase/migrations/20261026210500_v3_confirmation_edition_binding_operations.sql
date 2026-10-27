begin;
select public.v3_register_migration_contract(
  'v3.confirmation.edition-binding.operations',1,'forward_fix_only',false,null,
  'Governed edition binding authority; additive operations and fresh-auth enforcement');

-- V3 Worker 7 / System #702
--
-- Finish the existing Confirmation edition-link architecture instead of adding
-- a competing binding store. public.integration_links remains the binding
-- authority; public.editions.data_revision is the durable optimistic state
-- version so create/remove cycles cannot re-introduce an ABA stale-write hole.
-- The Organizer browser loses direct authority over Confirmation binding rows.

-- ---------------------------------------------------------------------------
-- Exact-edition projection
-- ---------------------------------------------------------------------------

create or replace function private.studio2_confirmation_edition_binding_projection(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_edition public.editions%rowtype;
  v_forward public.integration_links%rowtype;
  v_reverse public.integration_links%rowtype;
  v_expected_remote_id text;
  v_state text;
  v_blockers text[] := array[]::text[];
  v_round_count integer := 0;
  v_response_count integer := 0;
begin
  if p_edition_id is null then
    raise exception 'VALIDATION: edition id is required' using errcode = '22023';
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    raise exception 'NOT_FOUND: canonical edition does not exist' using errcode = 'P0002';
  end if;

  v_expected_remote_id := v_edition.id::text;

  select link.*
  into v_forward
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.solaris_id = v_edition.id;

  select link.*
  into v_reverse
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.remote_id = v_expected_remote_id;

  if v_forward.id is not null
     and (
       v_forward.remote_id is distinct from v_expected_remote_id
       or v_forward.edition_id is distinct from v_edition.id
     ) then
    v_blockers := array_append(v_blockers, 'SOLARIS_BINDING_CONFLICT');
  end if;

  if v_reverse.id is not null
     and v_reverse.solaris_id is distinct from v_edition.id then
    v_blockers := array_append(v_blockers, 'REMOTE_BINDING_CONFLICT');
  end if;

  if cardinality(v_blockers) > 0 then
    v_state := 'conflict';
  elsif v_forward.id is null then
    v_state := 'missing';
  elsif v_forward.sync_status is distinct from 'linked'
     or v_forward.last_synced_at is null
     or v_forward.metadata ->> 'edition_number' is distinct from v_edition.edition_number::text
     or v_forward.metadata ->> 'canonical_edition_id' is distinct from v_edition.id::text then
    v_state := 'stale';
  else
    v_state := 'linked';
  end if;

  select count(*)::integer
  into v_round_count
  from public.submission_rounds round
  where round.edition_id = v_edition.id;

  select count(*)::integer
  into v_response_count
  from public.submissions submission
  where submission.edition_id = v_edition.id;

  return jsonb_build_object(
    'editionId', v_edition.id,
    'editionNumber', v_edition.edition_number,
    'name', v_edition.name,
    'description', v_edition.description,
    'status', v_edition.status,
    'editingEnabled', v_edition.editing_enabled,
    'version', v_edition.data_revision,
    'bindingState', v_state,
    'binding', case
      when v_forward.id is null then null
      else jsonb_build_object(
        'id', v_forward.id,
        'remoteId', v_forward.remote_id,
        'syncStatus', v_forward.sync_status,
        'metadata', v_forward.metadata,
        'lastSyncedAt', v_forward.last_synced_at,
        'updatedAt', v_forward.updated_at
      )
    end,
    'roundCount', v_round_count,
    'responseCount', v_response_count,
    'blockers', to_jsonb(v_blockers)
  );
end
$projection$;

revoke all on function private.studio2_confirmation_edition_binding_projection(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_confirmation_edition_binding(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $read$
begin
  if p_edition_id is null then
    raise exception 'VALIDATION: edition id is required' using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('delegation.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: delegation.manage is required for this edition'
      using errcode = '42501';
  end if;

  return private.studio2_confirmation_edition_binding_projection(p_edition_id);
end
$read$;

revoke all on function public.studio2_confirmation_edition_binding(uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_edition_binding(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Server-authoritative preview
-- ---------------------------------------------------------------------------

create or replace function public.studio2_confirmation_edition_binding_preview(
  p_edition_id uuid,
  p_change_kind text,
  p_enabled boolean default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_kind text := lower(btrim(coalesce(p_change_kind, '')));
  v_projection jsonb;
  v_blockers jsonb;
  v_already_applied boolean := false;
  v_risk_class text := 'R2';
begin
  if p_edition_id is null then
    raise exception 'VALIDATION: edition id is required' using errcode = '22023';
  end if;

  if v_kind not in ('bind', 'remove', 'editing') then
    raise exception 'VALIDATION: unsupported Confirmation edition binding change'
      using errcode = '22023';
  end if;

  if v_kind = 'editing' and p_enabled is null then
    raise exception 'VALIDATION: editing change requires an enabled state'
      using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('delegation.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: delegation.manage is required for this edition'
      using errcode = '42501';
  end if;

  v_projection := private.studio2_confirmation_edition_binding_projection(p_edition_id);
  v_blockers := coalesce(v_projection -> 'blockers', '[]'::jsonb);

  if v_kind = 'editing'
     and coalesce(v_projection ->> 'bindingState', 'missing') not in ('linked', 'stale') then
    v_blockers := v_blockers || jsonb_build_array('BINDING_REQUIRED');
  end if;

  if v_kind = 'bind' then
    v_already_applied := v_projection ->> 'bindingState' = 'linked';
  elsif v_kind = 'remove' then
    v_already_applied := v_projection ->> 'bindingState' = 'missing';
    v_risk_class := 'R3';
  else
    v_already_applied := (v_projection ->> 'editingEnabled')::boolean = p_enabled;
    if p_enabled then
      v_risk_class := 'R3';
    end if;
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'changeKind', v_kind,
    'enabled', p_enabled,
    'expectedVersion', (v_projection ->> 'version')::bigint,
    'riskClass', v_risk_class,
    'alreadyApplied', v_already_applied,
    'bindingState', v_projection ->> 'bindingState',
    'editingEnabled', (v_projection ->> 'editingEnabled')::boolean,
    'roundCount', (v_projection ->> 'roundCount')::integer,
    'responseCount', (v_projection ->> 'responseCount')::integer,
    'blockers', v_blockers
  );
end
$preview$;

revoke all on function public.studio2_confirmation_edition_binding_preview(uuid, text, boolean)
  from public, anon;
grant execute on function public.studio2_confirmation_edition_binding_preview(uuid, text, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Versioned/idempotent apply command
-- ---------------------------------------------------------------------------

create or replace function public.studio2_apply_confirmation_edition_binding_change(
  p_edition_id uuid,
  p_change_kind text,
  p_enabled boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_kind text := lower(btrim(coalesce(p_change_kind, '')));
  v_command text;
  v_risk_class text := 'R2';
  v_claim jsonb;
  v_replay boolean := false;
  v_preview jsonb;
  v_edition public.editions%rowtype;
  v_forward public.integration_links%rowtype;
  v_reverse public.integration_links%rowtype;
  v_expected_remote_id text;
  v_changed boolean := false;
  v_before_version bigint;
  v_after_version bigint;
  v_after jsonb;
  v_result jsonb;
begin
  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 0 then
    raise exception 'VALIDATION: operation, idempotency key, edition and expected version are required'
      using errcode = '22023';
  end if;

  if v_kind not in ('bind', 'remove', 'editing') then
    raise exception 'VALIDATION: unsupported Confirmation edition binding change'
      using errcode = '22023';
  end if;

  if v_kind = 'editing' and p_enabled is null then
    raise exception 'VALIDATION: editing change requires an enabled state'
      using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('delegation.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: delegation.manage is required for this edition'
      using errcode = '42501';
  end if;

  v_command := case v_kind
    when 'bind' then 'confirmation.edition_binding.bind'
    when 'remove' then 'confirmation.edition_binding.remove'
    else 'confirmation.edition_editing.change'
  end;

  if v_kind = 'remove' or (v_kind = 'editing' and p_enabled) then
    v_risk_class := 'R3';
  end if;

  -- Idempotency is resolved before mutable current-state validation. A client
  -- that lost a successful response must receive the durable original receipt
  -- even when the binding or edition changed afterward.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    v_risk_class,
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'changeKind', v_kind,
      'enabled', p_enabled,
      'expectedVersion', p_expected_version
    )
  );

  v_replay := coalesce((v_claim ->> 'replayed')::boolean, false);
  if v_replay then
    return public.studio2_reconcile_operation((v_claim ->> 'operationId')::uuid)
      || jsonb_build_object('replayed', true);
  end if;

  v_preview := public.studio2_confirmation_edition_binding_preview(
    p_edition_id,
    v_kind,
    p_enabled
  );

  if jsonb_array_length(coalesce(v_preview -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'BINDING_CONFLICT: %', v_preview -> 'blockers'
      using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('confirmation-edition-binding:' || p_edition_id::text, 0)
  );

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'NOT_FOUND: canonical edition does not exist' using errcode = 'P0002';
  end if;

  -- Apply-time authorization is intentionally repeated after the lock.
  if not public.studio2_access_allowed('delegation.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: delegation.manage is no longer available for this edition'
      using errcode = '42501';
  end if;

  v_before_version := v_edition.data_revision;
  if v_before_version is distinct from p_expected_version then
    raise exception 'VERSION_CONFLICT: expected edition state version %, current version %',
      p_expected_version,
      v_before_version
      using errcode = 'PT409';
  end if;

  v_expected_remote_id := v_edition.id::text;

  select link.*
  into v_forward
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.solaris_id = v_edition.id
  for update;

  select link.*
  into v_reverse
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.remote_id = v_expected_remote_id
  for update;

  if v_forward.id is not null
     and (
       v_forward.remote_id is distinct from v_expected_remote_id
       or v_forward.edition_id is distinct from v_edition.id
     ) then
    raise exception 'BINDING_CONFLICT: Solaris edition is already bound to another Confirmation identity'
      using errcode = '23505';
  end if;

  if v_reverse.id is not null
     and v_reverse.solaris_id is distinct from v_edition.id then
    raise exception 'BINDING_CONFLICT: Confirmation identity is already bound to another Solaris edition'
      using errcode = '23505';
  end if;

  if v_kind = 'bind' then
    if v_forward.id is null then
      insert into public.integration_links (
        service,
        entity_type,
        solaris_id,
        remote_id,
        edition_id,
        sync_status,
        metadata,
        last_synced_at,
        updated_at
      ) values (
        'confirmations',
        'edition',
        v_edition.id,
        v_expected_remote_id,
        v_edition.id,
        'linked',
        jsonb_build_object(
          'edition_number', v_edition.edition_number,
          'canonical_edition_id', v_edition.id
        ),
        now(),
        now()
      );
      v_changed := true;
    elsif v_forward.sync_status is distinct from 'linked'
       or v_forward.last_synced_at is null
       or v_forward.metadata ->> 'edition_number' is distinct from v_edition.edition_number::text
       or v_forward.metadata ->> 'canonical_edition_id' is distinct from v_edition.id::text then
      update public.integration_links link
      set sync_status = 'linked',
          metadata = coalesce(link.metadata, '{}'::jsonb) || jsonb_build_object(
            'edition_number', v_edition.edition_number,
            'canonical_edition_id', v_edition.id
          ),
          last_synced_at = now(),
          updated_at = now()
      where link.id = v_forward.id;
      v_changed := true;
    end if;

  elsif v_kind = 'remove' then
    if v_forward.id is not null then
      delete from public.integration_links link
      where link.id = v_forward.id;
      v_changed := true;
    end if;

  else
    if v_forward.id is null then
      raise exception 'BINDING_REQUIRED: edition editing authority requires an exact Confirmation binding'
        using errcode = '55000';
    end if;

    if v_edition.editing_enabled is distinct from p_enabled then
      update public.editions edition
      set editing_enabled = p_enabled,
          data_revision = edition.data_revision + 1
      where edition.id = v_edition.id
      returning edition.data_revision into v_after_version;
      v_changed := true;
    end if;
  end if;

  if v_kind in ('bind', 'remove') and v_changed then
    update public.editions edition
    set data_revision = edition.data_revision + 1
    where edition.id = v_edition.id
    returning edition.data_revision into v_after_version;
  end if;

  if not v_changed then
    v_after_version := v_before_version;
  end if;

  v_after := private.studio2_confirmation_edition_binding_projection(v_edition.id);
  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'editionId', v_edition.id,
    'changeKind', v_kind,
    'changed', v_changed,
    'previousVersion', v_before_version,
    'version', v_after_version,
    'bindingState', v_after ->> 'bindingState',
    'editingEnabled', (v_after ->> 'editingEnabled')::boolean,
    'projection', v_after
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);

  return public.studio2_reconcile_operation(p_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_edition_binding_change(
  uuid, text, boolean, uuid, text, bigint, uuid
) from public, anon;
grant execute on function public.studio2_apply_confirmation_edition_binding_change(
  uuid, text, boolean, uuid, text, bigint, uuid
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- DomainEvent + transactional outbox integration
-- ---------------------------------------------------------------------------

create or replace function private.v3_emit_confirmation_edition_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_edition_id uuid;
  v_version bigint;
  v_changed boolean;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in (
       'confirmation.edition_binding.bind',
       'confirmation.edition_binding.remove',
       'confirmation.edition_editing.change'
     ) then
    return new;
  end if;

  begin
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
    v_changed := coalesce((new.result ->> 'changed')::boolean, false);
  exception when invalid_text_representation then
    raise exception 'Completed Confirmation edition operation has invalid event provenance'
      using errcode = '23514';
  end;

  if not v_changed then
    return new;
  end if;

  if v_edition_id is null or v_version is null then
    raise exception 'Completed Confirmation edition operation lacks event provenance'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'confirmation.window_changed',
    'confirmation_edition',
    v_edition_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', v_edition_id,
      'changeKind', new.result ->> 'changeKind',
      'bindingState', new.result ->> 'bindingState',
      'editingEnabled', new.result -> 'editingEnabled'
    )),
    1,
    array['confirmation.tasks', 'confirmation.notifications']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_confirmation_edition_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_confirmation_edition_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_confirmation_edition_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_confirmation_edition_operation_event();

-- ---------------------------------------------------------------------------
-- Browser authority boundary
-- ---------------------------------------------------------------------------

-- Keep unrelated integration services on their existing Organizer path while
-- removing authenticated browser DML for the Confirmation binding family.
drop policy if exists "integration links organizer only" on public.integration_links;
drop policy if exists "integration links organizer read" on public.integration_links;
drop policy if exists "integration links organizer insert non-confirmations" on public.integration_links;
drop policy if exists "integration links organizer update non-confirmations" on public.integration_links;
drop policy if exists "integration links organizer delete non-confirmations" on public.integration_links;

create policy "integration links organizer read"
on public.integration_links
for select
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, false));

create policy "integration links organizer insert non-confirmations"
on public.integration_links
for insert
to authenticated
with check (
  service <> 'confirmations'
  and public.studio2_access_allowed('edition.manage', edition_id, false)
);

create policy "integration links organizer update non-confirmations"
on public.integration_links
for update
to authenticated
using (
  service <> 'confirmations'
  and public.studio2_access_allowed('edition.manage', edition_id, false)
)
with check (
  service <> 'confirmations'
  and public.studio2_access_allowed('edition.manage', edition_id, false)
);

create policy "integration links organizer delete non-confirmations"
on public.integration_links
for delete
to authenticated
using (
  service <> 'confirmations'
  and public.studio2_access_allowed('edition.manage', edition_id, false)
);

notify pgrst, 'reload schema';

commit;

begin;

-- Solaris Studio V3 / System #702
--
-- Govern the Organizer Confirmation edition-link and edition-level existing-
-- response editing authority. Confirmations now runs on Solaris Studio's
-- canonical database, so the Solaris edition row is the metadata authority;
-- integration_links remains a compatibility identity map for legacy remote
-- Confirmation edition ids and must never be casually rebound by a browser.
select public.v3_register_migration_contract(
  'v3.confirmation.edition-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-edition Confirmation binding/editing projections, CAS versions, idempotent commands and direct-browser write guards without rewriting legacy binding identity.'
);

create table if not exists private.studio2_confirmation_edition_versions (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

revoke all on table private.studio2_confirmation_edition_versions
  from public, anon, authenticated;
grant all on table private.studio2_confirmation_edition_versions to service_role;

create or replace function private.studio2_touch_confirmation_edition_version(
  p_edition_id uuid,
  p_increment boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_version bigint;
begin
  if p_edition_id is null
     or not exists (select 1 from public.editions where id = p_edition_id) then
    return null;
  end if;

  insert into private.studio2_confirmation_edition_versions (
    edition_id,
    version,
    updated_at
  ) values (
    p_edition_id,
    1,
    now()
  )
  on conflict (edition_id) do update
  set version = case
        when p_increment then private.studio2_confirmation_edition_versions.version + 1
        else private.studio2_confirmation_edition_versions.version
      end,
      updated_at = case
        when p_increment then now()
        else private.studio2_confirmation_edition_versions.updated_at
      end
  returning version into v_version;

  return v_version;
end
$touch$;

revoke all on function private.studio2_touch_confirmation_edition_version(uuid, boolean)
  from public, anon, authenticated;

create or replace function private.studio2_confirmation_edition_row_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $version$
begin
  if tg_op = 'INSERT' then
    perform private.studio2_touch_confirmation_edition_version(new.id, false);
  elsif old.name is distinct from new.name
        or old.edition_number is distinct from new.edition_number
        or old.description is distinct from new.description
        or old.status is distinct from new.status
        or old.editing_enabled is distinct from new.editing_enabled then
    perform private.studio2_touch_confirmation_edition_version(new.id, true);
  end if;
  return new;
end
$version$;

revoke all on function private.studio2_confirmation_edition_row_version()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_edition_version on public.editions;
create trigger studio2_confirmation_edition_version
after insert or update of name, edition_number, description, status, editing_enabled
on public.editions
for each row execute function private.studio2_confirmation_edition_row_version();

create or replace function private.studio2_confirmation_edition_link_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $version$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT'
     and old.service = 'confirmations'
     and old.entity_type = 'edition' then
    v_old_edition := old.solaris_id;
  end if;

  if tg_op <> 'DELETE'
     and new.service = 'confirmations'
     and new.entity_type = 'edition' then
    v_new_edition := new.solaris_id;
  end if;

  if v_old_edition is not null then
    perform private.studio2_touch_confirmation_edition_version(v_old_edition, true);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_touch_confirmation_edition_version(v_new_edition, true);
  end if;

  return coalesce(new, old);
end
$version$;

revoke all on function private.studio2_confirmation_edition_link_version()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_edition_link_version on public.integration_links;
create trigger studio2_confirmation_edition_link_version
after insert or update or delete on public.integration_links
for each row execute function private.studio2_confirmation_edition_link_version();

-- Block authenticated browser writes to the exact authority this migration now
-- owns. Trusted service-role sync remains available for server-only compatibility
-- ingestion; governed Organizer commands use a transaction-local marker.
create or replace function private.studio2_guard_confirmation_edition_link_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_service text := case when tg_op = 'DELETE' then old.service else new.service end;
  v_entity_type text := case when tg_op = 'DELETE' then old.entity_type else new.entity_type end;
begin
  if v_service <> 'confirmations' or v_entity_type <> 'edition' then
    return coalesce(new, old);
  end if;

  if session_user in ('postgres', 'supabase_admin')
     or pg_has_role(session_user, 'postgres', 'member')
     or private.studio2_request_is_service_role()
     or coalesce(current_setting('studio2.confirmation_edition_authority_write', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  raise exception 'Confirmation edition bindings must use the governed V3 command'
    using errcode = '42501';
end
$guard$;

revoke all on function private.studio2_guard_confirmation_edition_link_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_confirmation_edition_link_write on public.integration_links;
create trigger studio2_guard_confirmation_edition_link_write
before insert or update or delete on public.integration_links
for each row execute function private.studio2_guard_confirmation_edition_link_write();

create or replace function private.studio2_guard_confirmation_edition_editing_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if old.editing_enabled is not distinct from new.editing_enabled then
    return new;
  end if;

  if session_user in ('postgres', 'supabase_admin')
     or pg_has_role(session_user, 'postgres', 'member')
     or private.studio2_request_is_service_role()
     or coalesce(current_setting('studio2.confirmation_edition_authority_write', true), '') = 'on' then
    return new;
  end if;

  raise exception 'Confirmation edition editing must use the governed V3 command'
    using errcode = '42501';
end
$guard$;

revoke all on function private.studio2_guard_confirmation_edition_editing_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_confirmation_edition_editing_write on public.editions;
create trigger studio2_guard_confirmation_edition_editing_write
before update of editing_enabled on public.editions
for each row execute function private.studio2_guard_confirmation_edition_editing_write();

create or replace function public.studio2_confirmation_edition_snapshot(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_edition public.editions%rowtype;
  v_link public.integration_links%rowtype;
  v_reverse public.integration_links%rowtype;
  v_version bigint := 1;
  v_round_count integer := 0;
  v_response_count integer := 0;
  v_binding_state text;
begin
  if p_edition_id is null then
    raise exception 'Exact Organizer edition id is required' using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    raise exception 'Solaris edition not found' using errcode = 'P0002';
  end if;

  select link.*
  into v_link
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.solaris_id = p_edition_id
  limit 1;

  select link.*
  into v_reverse
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.remote_id = p_edition_id::text
    and link.solaris_id <> p_edition_id
  limit 1;

  select version.version
  into v_version
  from private.studio2_confirmation_edition_versions version
  where version.edition_id = p_edition_id;
  v_version := coalesce(v_version, 1);

  select count(*)::integer
  into v_round_count
  from public.submission_rounds round
  where round.edition_id = p_edition_id;

  select count(*)::integer
  into v_response_count
  from public.submissions submission
  where submission.edition_id = p_edition_id;

  v_binding_state := case
    when v_reverse.id is not null then 'conflict'
    when v_link.id is null then 'missing'
    when v_link.edition_id is distinct from p_edition_id then 'stale'
    when v_link.sync_status is distinct from 'linked' then 'stale'
    else 'linked'
  end;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'editionNumber', v_edition.edition_number,
      'description', v_edition.description,
      'status', v_edition.status,
      'editingEnabled', coalesce(v_edition.editing_enabled, false)
    ),
    'confirmationEdition', case
      when v_link.id is null then null
      else jsonb_build_object(
        'remoteId', v_link.remote_id,
        'name', v_edition.name,
        'editionNumber', v_edition.edition_number,
        'description', v_edition.description,
        'status', v_edition.status
      )
    end,
    'binding', case
      when v_link.id is null then null
      else jsonb_build_object(
        'id', v_link.id,
        'solarisId', v_link.solaris_id,
        'remoteId', v_link.remote_id,
        'editionId', v_link.edition_id,
        'syncStatus', v_link.sync_status,
        'lastSyncedAt', v_link.last_synced_at
      )
    end,
    'bindingState', v_binding_state,
    'bindingValid', v_binding_state = 'linked',
    'reverseConflict', case
      when v_reverse.id is null then null
      else jsonb_build_object(
        'id', v_reverse.id,
        'solarisId', v_reverse.solaris_id,
        'remoteId', v_reverse.remote_id,
        'editionId', v_reverse.edition_id
      )
    end,
    'roundCount', v_round_count,
    'responseCount', v_response_count,
    'stateVersion', v_version,
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function public.studio2_confirmation_edition_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_edition_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_confirmation_edition_link_preview(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_snapshot jsonb;
  v_state text;
  v_blockers jsonb := '[]'::jsonb;
begin
  v_snapshot := public.studio2_confirmation_edition_snapshot(p_edition_id);
  v_state := v_snapshot ->> 'bindingState';

  if v_state = 'conflict' then
    v_blockers := jsonb_build_array(
      'A Confirmation remote identity is already bound to another Solaris edition. Automatic rebinding is prohibited.'
    );
  end if;

  return v_snapshot || jsonb_build_object(
    'riskClass', 'R2',
    'alreadyApplied', v_state = 'linked',
    'willCreateBinding', v_state = 'missing',
    'willRepairBinding', v_state = 'stale',
    'blockers', v_blockers
  );
end
$preview$;

revoke all on function public.studio2_confirmation_edition_link_preview(uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_edition_link_preview(uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_edition_link_reconciliation(
  p_edition_id uuid,
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
  v_edition public.editions%rowtype;
  v_link public.integration_links%rowtype;
  v_reverse public.integration_links%rowtype;
  v_version bigint;
  v_after_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_before jsonb;
begin
  if p_edition_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Edition, operation, idempotency key and expected version are required'
      using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'confirmation.edition_link.reconcile',
    'R2',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('expectedVersion', p_expected_version)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'Solaris edition not found' using errcode = 'P0002';
  end if;

  insert into private.studio2_confirmation_edition_versions (edition_id, version, updated_at)
  values (p_edition_id, 1, now())
  on conflict (edition_id) do nothing;

  select version.version
  into v_version
  from private.studio2_confirmation_edition_versions version
  where version.edition_id = p_edition_id
  for update;

  if v_version is distinct from p_expected_version then
    raise exception 'Confirmation edition state changed since preview. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  select link.*
  into v_link
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.solaris_id = p_edition_id
  limit 1
  for update;

  select link.*
  into v_reverse
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.remote_id = p_edition_id::text
    and link.solaris_id <> p_edition_id
  limit 1
  for update;

  if v_reverse.id is not null then
    raise exception 'Confirmation remote identity is already bound to another Solaris edition'
      using errcode = '23505';
  end if;

  v_before := case
    when v_link.id is null then null
    else jsonb_build_object(
      'id', v_link.id,
      'solarisId', v_link.solaris_id,
      'remoteId', v_link.remote_id,
      'editionId', v_link.edition_id,
      'syncStatus', v_link.sync_status
    )
  end;

  perform set_config('studio2.confirmation_edition_authority_write', 'on', true);

  if v_link.id is null then
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
      p_edition_id,
      p_edition_id::text,
      p_edition_id,
      'linked',
      jsonb_build_object(
        'edition_number', v_edition.edition_number,
        'authority', 'canonical-solaris-edition'
      ),
      now(),
      now()
    )
    returning * into v_link;
  elsif v_link.edition_id is distinct from p_edition_id
        or v_link.sync_status is distinct from 'linked' then
    update public.integration_links
    set edition_id = p_edition_id,
        sync_status = 'linked',
        last_synced_at = now(),
        updated_at = now()
    where id = v_link.id
    returning * into v_link;
  end if;

  select coalesce(version.version, 1)
  into v_after_version
  from private.studio2_confirmation_edition_versions version
  where version.edition_id = p_edition_id;
  v_after_version := coalesce(v_after_version, v_version);

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'confirmation_edition_link_reconciled',
    'integration_links',
    v_link.id::text,
    v_before,
    jsonb_build_object(
      'editionId', p_edition_id,
      'bindingId', v_link.id,
      'remoteId', v_link.remote_id,
      'syncStatus', v_link.sync_status,
      'stateVersion', v_after_version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'bindingId', v_link.id,
    'remoteId', v_link.remote_id,
    'bindingState', 'linked',
    'previousVersion', v_version,
    'version', v_after_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_edition_link_reconciliation(
  uuid, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_edition_link_reconciliation(
  uuid, uuid, text, bigint
) to authenticated, service_role;

create or replace function public.studio2_confirmation_edition_editing_preview(
  p_edition_id uuid,
  p_target_enabled boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_snapshot jsonb;
  v_current boolean;
  v_status text;
  v_open_rounds integer := 0;
  v_risk text := 'R2';
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_target_enabled is null then
    raise exception 'Target editing state is required' using errcode = '22023';
  end if;

  v_snapshot := public.studio2_confirmation_edition_snapshot(p_edition_id);
  v_current := coalesce((v_snapshot #>> '{edition,editingEnabled}')::boolean, false);
  v_status := coalesce(v_snapshot #>> '{edition,status}', '');

  select count(*)::integer
  into v_open_rounds
  from public.submission_rounds round
  where round.edition_id = p_edition_id
    and round.status = 'open';

  if v_snapshot ->> 'bindingState' <> 'linked' then
    v_blockers := v_blockers || jsonb_build_array(
      'Repair the exact Confirmation edition binding before changing edition-wide response editing.'
    );
  end if;

  if p_target_enabled and not v_current and v_status in ('completed', 'archived', 'cancelled') then
    v_blockers := v_blockers || jsonb_build_array(
      'Completed, archived or cancelled editions cannot reopen edition-wide response editing through the normal command.'
    );
  end if;

  if p_target_enabled and not v_current and v_open_rounds = 0 then
    v_risk := 'R3';
  end if;

  return v_snapshot || jsonb_build_object(
    'riskClass', v_risk,
    'currentEditingEnabled', v_current,
    'targetEditingEnabled', p_target_enabled,
    'alreadyApplied', v_current = p_target_enabled,
    'openRoundCount', v_open_rounds,
    'requiresFreshAuth', v_risk = 'R3',
    'expectedRemoteId', v_snapshot #>> '{binding,remoteId}',
    'blockers', v_blockers
  );
end
$preview$;

revoke all on function public.studio2_confirmation_edition_editing_preview(uuid, boolean)
  from public, anon;
grant execute on function public.studio2_confirmation_edition_editing_preview(uuid, boolean)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_edition_editing(
  p_edition_id uuid,
  p_expected_remote_id text,
  p_target_enabled boolean,
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
  v_edition public.editions%rowtype;
  v_link public.integration_links%rowtype;
  v_version bigint;
  v_after_version bigint;
  v_open_rounds integer := 0;
  v_risk text := 'R2';
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if p_edition_id is null or p_operation_id is null
     or p_target_enabled is null
     or nullif(btrim(coalesce(p_expected_remote_id, '')), '') is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Exact edition, binding, operation, idempotency key and expected version are required'
      using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  -- Risk is part of semantic identity. Compute it from canonical state before
  -- claiming the operation and re-check all mutable state under locks below.
  select count(*)::integer
  into v_open_rounds
  from public.submission_rounds round
  where round.edition_id = p_edition_id
    and round.status = 'open';

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    raise exception 'Solaris edition not found' using errcode = 'P0002';
  end if;

  if p_target_enabled and not coalesce(v_edition.editing_enabled, false) and v_open_rounds = 0 then
    v_risk := 'R3';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'confirmation.edition.editing.set',
    v_risk,
    jsonb_build_object('editionId', p_edition_id, 'remoteId', p_expected_remote_id),
    jsonb_build_object(
      'targetEditingEnabled', p_target_enabled,
      'expectedVersion', p_expected_version
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'Solaris edition not found' using errcode = 'P0002';
  end if;

  insert into private.studio2_confirmation_edition_versions (edition_id, version, updated_at)
  values (p_edition_id, 1, now())
  on conflict (edition_id) do nothing;

  select version.version
  into v_version
  from private.studio2_confirmation_edition_versions version
  where version.edition_id = p_edition_id
  for update;

  if v_version is distinct from p_expected_version then
    raise exception 'Confirmation edition state changed since preview. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  select link.*
  into v_link
  from public.integration_links link
  where link.service = 'confirmations'
    and link.entity_type = 'edition'
    and link.solaris_id = p_edition_id
  limit 1
  for update;

  if v_link.id is null
     or v_link.edition_id is distinct from p_edition_id
     or v_link.sync_status is distinct from 'linked'
     or v_link.remote_id is distinct from p_expected_remote_id then
    raise exception 'Confirmation binding changed since preview. Repair or refresh before continuing.'
      using errcode = 'PT409';
  end if;

  select count(*)::integer
  into v_open_rounds
  from public.submission_rounds round
  where round.edition_id = p_edition_id
    and round.status = 'open';

  if p_target_enabled
     and not coalesce(v_edition.editing_enabled, false)
     and v_edition.status in ('completed', 'archived', 'cancelled') then
    raise exception 'Historical edition editing cannot be reopened through the normal Confirmation command'
      using errcode = '55000';
  end if;

  v_risk := case
    when p_target_enabled
      and not coalesce(v_edition.editing_enabled, false)
      and v_open_rounds = 0 then 'R3'
    else 'R2'
  end;

  if v_risk is distinct from coalesce(
    (select receipt.risk_class from public.studio2_operation_receipts receipt where receipt.operation_id = v_operation_id),
    v_risk
  ) then
    raise exception 'Confirmation editing risk changed since operation claim. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  if v_risk = 'R3' then
    perform private.studio2_require_fresh_auth(300);
  end if;

  if coalesce(v_edition.editing_enabled, false) is distinct from p_target_enabled then
    perform set_config('studio2.confirmation_edition_authority_write', 'on', true);

    update public.editions
    set editing_enabled = p_target_enabled
    where id = p_edition_id
    returning * into v_edition;
  end if;

  select coalesce(version.version, 1)
  into v_after_version
  from private.studio2_confirmation_edition_versions version
  where version.edition_id = p_edition_id;
  v_after_version := coalesce(v_after_version, v_version);

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'confirmation_edition_editing_changed',
    'editions',
    p_edition_id::text,
    jsonb_build_object(
      'editingEnabled', not p_target_enabled,
      'bindingRemoteId', p_expected_remote_id,
      'stateVersion', v_version
    ),
    jsonb_build_object(
      'editingEnabled', p_target_enabled,
      'bindingRemoteId', p_expected_remote_id,
      'stateVersion', v_after_version,
      'riskClass', v_risk
    )
  );

  perform private.v3_emit_domain_event(
    'confirmation.window_changed',
    'confirmation_edition',
    p_edition_id::text,
    v_after_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'editionId', p_edition_id,
      'changeKind', 'edition_editing',
      'editingEnabled', p_target_enabled,
      'bindingRemoteId', p_expected_remote_id
    ),
    1,
    array['confirmation.tasks', 'confirmation.notifications']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'remoteId', p_expected_remote_id,
    'editingEnabled', p_target_enabled,
    'riskClass', v_risk,
    'previousVersion', v_version,
    'version', v_after_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_edition_editing(
  uuid, text, boolean, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_edition_editing(
  uuid, text, boolean, uuid, text, bigint
) to authenticated, service_role;

comment on function public.studio2_confirmation_edition_snapshot(uuid) is
  'Exact-edition Organizer projection for canonical Confirmation edition binding/editing authority; never falls back to active/latest edition.';
comment on function public.studio2_apply_confirmation_edition_link_reconciliation(uuid, uuid, text, bigint) is
  'Idempotent exact-edition Confirmation binding reconciliation. Preserves existing legacy remote identity and refuses cross-edition rebinding.';
comment on function public.studio2_apply_confirmation_edition_editing(uuid, text, boolean, uuid, text, bigint) is
  'Idempotent CAS-bound edition-wide Confirmation editing command with exact binding identity and R3 fresh-auth protection outside an open round.';

notify pgrst, 'reload schema';

commit;

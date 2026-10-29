begin;
select public.v3_register_migration_contract(
  'v3.confirmation.edition-binding.fresh-auth',1,'forward_fix_only',false,null,
  'Governed edition binding authority; additive operations and fresh-auth enforcement');

-- System #702 follow-up: use the existing Organisation OS R3 freshness
-- primitive at the authoritative command boundary. Client password UX is not
-- treated as security authority; the signed JWT AMR evidence is revalidated in
-- PostgreSQL immediately before any R3 binding removal or editing expansion.
-- Idempotent replay remains first so a previously succeeded exact operation can
-- be reconciled without forcing another password prompt after a lost response.

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
  v_auth_freshness jsonb := null;
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

  -- Claim and resolve an exact replay before freshness/current-state checks.
  -- This preserves the canonical lost-response recovery contract.
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

  if v_risk_class = 'R3' then
    v_auth_freshness := private.studio2_require_fresh_auth(300);
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

  if v_auth_freshness is not null then
    update public.studio2_operation_receipts receipt
    set actor_session_id = v_auth_freshness ->> 'sessionId',
        auth_freshness_evidence = v_auth_freshness,
        updated_at = now()
    where receipt.operation_id = p_operation_id
      and receipt.actor_id = auth.uid();
  end if;

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

notify pgrst, 'reload schema';

commit;

begin;

-- V3 System / #594: govern consequential Confirmation response access changes.
--
-- This is additive. Legacy Organizer RPCs remain available during consumer
-- cutover, while the new command boundary provides exact-edition scope,
-- optimistic concurrency, semantic idempotency, canonical receipts and
-- one-time recovery-secret semantics.
select public.v3_register_migration_contract(
  '20261019223000_v3_confirmation_response_access_commands',
  1,
  'forward_fix_only',
  false,
  null,
  'Governed exact-edition Confirmation response access/recovery operations; permanent deletion is dependency-gated and R3 fresh-auth protected'
);

-- The existing review version is the canonical response-state version already
-- used by Entry/NF review commands. Access controls and recovery-token state are
-- part of the same response truth, so make those changes advance it as well.
create or replace function private.v3_touch_confirmation_response_access_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_submission_id uuid;
begin
  if tg_table_name = 'submissions' then
    v_submission_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'edit_tokens' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  end if;

  if v_submission_id is not null
     and exists (select 1 from public.submissions s where s.id = v_submission_id) then
    insert into public.studio2_confirmation_review_versions (
      submission_id,
      version,
      updated_at
    ) values (
      v_submission_id,
      1,
      now()
    )
    on conflict (submission_id)
    do update set
      version = public.studio2_confirmation_review_versions.version + 1,
      updated_at = now();
  end if;

  return coalesce(new, old);
end
$touch$;

revoke all on function private.v3_touch_confirmation_response_access_version()
  from public, anon, authenticated;

drop trigger if exists v3_touch_confirmation_response_access_version
  on public.submissions;
create trigger v3_touch_confirmation_response_access_version
after update of editing_allowed, locked, admin_notes
on public.submissions
for each row
when (
  old.editing_allowed is distinct from new.editing_allowed
  or old.locked is distinct from new.locked
  or old.admin_notes is distinct from new.admin_notes
)
execute function private.v3_touch_confirmation_response_access_version();

drop trigger if exists v3_touch_confirmation_edit_token_version
  on public.edit_tokens;
create trigger v3_touch_confirmation_edit_token_version
after insert or update of active, token_type, expires_at or delete
on public.edit_tokens
for each row execute function private.v3_touch_confirmation_response_access_version();

create or replace function private.v3_confirmation_response_delete_dependencies(
  p_submission_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $dependencies$
  select jsonb_build_object(
    'internalEntries', (select count(*) from public.internal_entries e where e.submission_id = p_submission_id),
    'nationalFinals', (select count(*) from public.national_finals nf where nf.submission_id = p_submission_id),
    'nextInLineSubmissions', (select count(*) from public.next_in_line_submissions n where n.source_submission_id = p_submission_id),
    'nextInLineResponses', (select count(*) from public.next_in_line_responses n where n.source_submission_id = p_submission_id),
    'reviewHistory', (select count(*) from public.submission_review_history h where h.submission_id = p_submission_id),
    'submissionVersions', (select count(*) from public.submission_versions v where v.submission_id = p_submission_id),
    'resolvedRequirements', (select count(*) from public.studio2_confirmation_requirements r where r.resolved_by_submission_id = p_submission_id),
    'editTokens', (select count(*) from public.edit_tokens t where t.submission_id = p_submission_id),
    'ipHistory', (select count(*) from public.submission_ip_history h where h.submission_id = p_submission_id),
    'browserSessions', (select count(*) from public.submission_browser_sessions b where b.submission_id = p_submission_id)
  )
$dependencies$;

revoke all on function private.v3_confirmation_response_delete_dependencies(uuid)
  from public, anon, authenticated;

create or replace function private.v3_confirmation_response_delete_allowed(
  p_submission public.submissions,
  p_dependencies jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $allowed$
  select
    not coalesce(p_submission.reviewed, false)
    and coalesce(p_submission.edit_count, 0) = 0
    and coalesce((p_dependencies ->> 'internalEntries')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'nationalFinals')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'nextInLineSubmissions')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'nextInLineResponses')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'reviewHistory')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'submissionVersions')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'resolvedRequirements')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'editTokens')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'ipHistory')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'browserSessions')::bigint, 0) = 0
$allowed$;

revoke all on function private.v3_confirmation_response_delete_allowed(public.submissions, jsonb)
  from public, anon, authenticated;

create or replace function public.studio2_confirmation_response_access_preview(
  p_edition_id uuid,
  p_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_submission public.submissions;
  v_round public.submission_rounds;
  v_edition public.editions;
  v_version bigint;
  v_tokens jsonb;
  v_dependencies jsonb;
  v_delete_allowed boolean;
begin
  if p_edition_id is null or p_submission_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select s.* into v_submission
  from public.submissions s
  where s.id = p_submission_id
    and s.edition_id = p_edition_id;

  if v_submission.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  select r.* into v_round
  from public.submission_rounds r
  where r.id = v_submission.round_id
    and r.edition_id = p_edition_id;

  select e.* into v_edition
  from public.editions e
  where e.id = p_edition_id;

  if v_round.id is null or v_edition.id is null then
    raise exception using errcode = '23503', message = 'STATE_CHANGED';
  end if;

  select rv.version into v_version
  from public.studio2_confirmation_review_versions rv
  where rv.submission_id = p_submission_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'tokenType', t.token_type,
      'active', t.active,
      'createdAt', t.created_at,
      'expiresAt', t.expires_at,
      'lastUsedAt', t.last_used_at,
      'useCount', t.use_count
    ) order by t.created_at desc, t.id
  ), '[]'::jsonb)
  into v_tokens
  from public.edit_tokens t
  where t.submission_id = p_submission_id;

  v_dependencies := private.v3_confirmation_response_delete_dependencies(p_submission_id);
  v_delete_allowed := private.v3_confirmation_response_delete_allowed(v_submission, v_dependencies);

  return jsonb_build_object(
    'editionId', p_edition_id,
    'submissionId', p_submission_id,
    'roundId', v_submission.round_id,
    'country', v_submission.country,
    'expectedVersion', coalesce(v_version, 1),
    'state', jsonb_build_object(
      'editingAllowed', v_submission.editing_allowed,
      'locked', v_submission.locked,
      'adminNotes', v_submission.admin_notes,
      'reviewed', v_submission.reviewed,
      'editCount', v_submission.edit_count,
      'roundStatus', v_round.status,
      'roundEditingEnabled', coalesce(v_round.editing_enabled, false),
      'editionEditingEnabled', coalesce(v_edition.editing_enabled, false)
    ),
    'recoveryTokens', v_tokens,
    'delete', jsonb_build_object(
      'allowed', v_delete_allowed,
      'riskClass', 'R3',
      'dependencies', v_dependencies,
      'policy', case
        when v_delete_allowed then 'permanent_delete_only_for_unreviewed_dependency_free_response'
        else 'preserve_historical_or_dependent_confirmation_record'
      end
    ),
    'risk', jsonb_build_object(
      'accessUpdate', 'R2',
      'recoveryIssue', 'R2',
      'recoveryInvalidate', 'R2',
      'permanentDelete', 'R3'
    ),
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_confirmation_response_access_preview(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_response_access_preview(uuid, uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_response_access_change(
  p_edition_id uuid,
  p_submission_id uuid,
  p_change_kind text,
  p_payload jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_kind text := lower(btrim(coalesce(p_change_kind, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_risk text;
  v_command text;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_submission public.submissions;
  v_round public.submission_rounds;
  v_edition public.editions;
  v_version bigint;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_dependencies jsonb;
  v_delete_allowed boolean;
  v_editing_allowed boolean;
  v_locked boolean;
  v_admin_notes text;
  v_token_type text;
  v_expires_hours integer;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_token_plaintext text;
  v_token_hash text;
  v_token public.edit_tokens;
  v_active_before integer := 0;
  v_active_after integer := 0;
  v_changed boolean := false;
  v_country_id uuid;
  v_event_payload jsonb;
begin
  if p_edition_id is null
     or p_submission_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_kind not in ('update_access', 'issue_recovery', 'invalidate_recovery', 'delete_response') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_risk := case when v_kind = 'delete_response' then 'R3' else 'R2' end;
  v_command := case v_kind
    when 'update_access' then 'confirmation.response.access.update'
    when 'issue_recovery' then 'confirmation.response.recovery.issue'
    when 'invalidate_recovery' then 'confirmation.response.recovery.invalidate'
    else 'confirmation.response.delete'
  end;

  -- Claim before current-version validation so an exact retry can recover the
  -- original committed receipt after canonical state has advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'changeKind', v_kind
    ),
    jsonb_build_object(
      'payload', v_payload,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object(
          'replayed', true,
          'secretAvailable', false
        );
    end if;

    return jsonb_build_object(
      'ok', false,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true,
      'secretAvailable', false
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_kind = 'delete_response' then
    if v_reason is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    perform private.studio2_require_fresh_auth(300);
  end if;

  select s.* into v_submission
  from public.submissions s
  where s.id = p_submission_id
    and s.edition_id = p_edition_id
  for update;

  if v_submission.id is null then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  select r.* into v_round
  from public.submission_rounds r
  where r.id = v_submission.round_id
    and r.edition_id = p_edition_id
  for share;

  select e.* into v_edition
  from public.editions e
  where e.id = p_edition_id
  for share;

  if v_round.id is null or v_edition.id is null then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  insert into public.studio2_confirmation_review_versions (submission_id, version, updated_at)
  values (p_submission_id, 1, now())
  on conflict (submission_id) do nothing;

  select rv.version into v_version
  from public.studio2_confirmation_review_versions rv
  where rv.submission_id = p_submission_id
  for update;

  if v_version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  select c.id into v_country_id
  from public.countries c
  where lower(btrim(c.name)) = lower(btrim(v_submission.country))
     or lower(btrim(c.short_code)) = lower(btrim(v_submission.country))
  order by case when lower(btrim(c.name)) = lower(btrim(v_submission.country)) then 0 else 1 end
  limit 1;

  v_before := jsonb_build_object(
    'editingAllowed', v_submission.editing_allowed,
    'locked', v_submission.locked,
    'adminNotes', v_submission.admin_notes,
    'version', v_version
  );

  if v_kind = 'update_access' then
    if not (v_payload ? 'editingAllowed') or not (v_payload ? 'locked') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    begin
      v_editing_allowed := (v_payload ->> 'editingAllowed')::boolean;
      v_locked := (v_payload ->> 'locked')::boolean;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    v_admin_notes := nullif(btrim(coalesce(v_payload ->> 'adminNotes', '')), '');

    if v_editing_allowed and v_locked then
      raise exception using errcode = '23514', message = 'STATE_CHANGED';
    end if;
    if v_editing_allowed and not coalesce(v_round.editing_enabled, false) then
      raise exception using errcode = '23514', message = 'STATE_CHANGED';
    end if;
    if v_editing_allowed and not coalesce(v_edition.editing_enabled, false) then
      raise exception using errcode = '23514', message = 'STATE_CHANGED';
    end if;

    select count(*)::integer into v_active_before
    from public.edit_tokens t
    where t.submission_id = p_submission_id and t.active = true;

    v_changed := v_submission.editing_allowed is distinct from v_editing_allowed
      or v_submission.locked is distinct from v_locked
      or v_submission.admin_notes is distinct from v_admin_notes;

    if v_changed then
      update public.submissions
      set editing_allowed = v_editing_allowed,
          locked = v_locked,
          admin_notes = v_admin_notes,
          updated_at = now()
      where id = p_submission_id;
    end if;

    select count(*)::integer into v_active_after
    from public.edit_tokens t
    where t.submission_id = p_submission_id and t.active = true;

    select rv.version into v_version
    from public.studio2_confirmation_review_versions rv
    where rv.submission_id = p_submission_id;

    v_after := jsonb_build_object(
      'editingAllowed', v_editing_allowed,
      'locked', v_locked,
      'adminNotes', v_admin_notes,
      'version', v_version
    );

    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'changeKind', v_kind,
      'changed', v_changed,
      'version', v_version,
      'editingAllowed', v_editing_allowed,
      'locked', v_locked,
      'revokedEditTokens', greatest(v_active_before - v_active_after, 0),
      'serverTime', now()
    );

  elsif v_kind = 'issue_recovery' then
    v_token_type := lower(btrim(coalesce(v_payload ->> 'tokenType', '')));
    begin
      v_expires_hours := nullif(v_payload ->> 'expiresInHours', '')::integer;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    if v_token_type not in ('one_time', 'reusable')
       or (v_expires_hours is not null and (v_expires_hours < 1 or v_expires_hours > 8760)) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if not coalesce(v_submission.editing_allowed, false)
       or coalesce(v_submission.locked, false)
       or not coalesce(v_round.editing_enabled, false)
       or not coalesce(v_edition.editing_enabled, false) then
      raise sqlstate 'PT409' using message = 'STATE_CHANGED';
    end if;

    update public.edit_tokens
    set active = false
    where submission_id = p_submission_id
      and active = true;

    v_token_plaintext := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_token_plaintext, 'sha256'), 'hex');
    v_expires_at := case
      when v_expires_hours is null then null
      else now() + make_interval(hours => v_expires_hours)
    end;

    insert into public.edit_tokens (
      submission_id,
      token_hash,
      token_type,
      active,
      expires_at
    ) values (
      p_submission_id,
      v_token_hash,
      v_token_type,
      true,
      v_expires_at
    )
    returning id into v_token_id;

    select rv.version into v_version
    from public.studio2_confirmation_review_versions rv
    where rv.submission_id = p_submission_id;

    v_after := jsonb_build_object(
      'tokenId', v_token_id,
      'tokenType', v_token_type,
      'expiresAt', v_expires_at,
      'version', v_version,
      'secretPersisted', false
    );

    -- Deliberately exclude plaintext token from the durable receipt. If the
    -- first response is lost, replay proves issuance but cannot redisplay the
    -- credential; Organizer must explicitly issue a replacement.
    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'changeKind', v_kind,
      'version', v_version,
      'tokenId', v_token_id,
      'tokenType', v_token_type,
      'expiresAt', v_expires_at,
      'secretAvailable', false,
      'serverTime', now()
    );

  elsif v_kind = 'invalidate_recovery' then
    begin
      v_token_id := nullif(v_payload ->> 'tokenId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    if v_token_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select t.* into v_token
    from public.edit_tokens t
    where t.id = v_token_id
      and t.submission_id = p_submission_id
    for update;

    if v_token.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;

    v_changed := coalesce(v_token.active, false);
    if v_changed then
      update public.edit_tokens
      set active = false
      where id = v_token_id;
    end if;

    select rv.version into v_version
    from public.studio2_confirmation_review_versions rv
    where rv.submission_id = p_submission_id;

    v_after := jsonb_build_object(
      'tokenId', v_token_id,
      'active', false,
      'version', v_version
    );

    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'changeKind', v_kind,
      'changed', v_changed,
      'tokenId', v_token_id,
      'version', v_version,
      'serverTime', now()
    );

  else
    v_dependencies := private.v3_confirmation_response_delete_dependencies(p_submission_id);
    v_delete_allowed := private.v3_confirmation_response_delete_allowed(v_submission, v_dependencies);

    if not v_delete_allowed then
      raise sqlstate 'PT409' using
        message = 'DEPENDENCY_FAILURE',
        detail = v_dependencies::text;
    end if;

    v_after := jsonb_build_object(
      'deleted', true,
      'reason', v_reason,
      'dependencies', v_dependencies
    );

    delete from public.submissions
    where id = p_submission_id
      and edition_id = p_edition_id;

    if not found then
      raise sqlstate 'PT409' using message = 'STATE_CHANGED';
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'changeKind', v_kind,
      'deleted', true,
      'version', p_expected_version,
      'serverTime', now()
    );
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    country_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'v3_' || replace(v_command, '.', '_'),
    case when v_kind = 'issue_recovery' or v_kind = 'invalidate_recovery' then 'edit_tokens' else 'submissions' end,
    case when v_token_id is not null then v_token_id::text else p_submission_id::text end,
    p_edition_id,
    v_country_id,
    v_before || jsonb_build_object(
      'operationId', v_canonical_operation_id,
      'reason', v_reason
    ),
    coalesce(v_after, '{}'::jsonb) || jsonb_build_object(
      'operationId', v_canonical_operation_id,
      'reason', v_reason
    )
  );

  v_event_payload := jsonb_strip_nulls(jsonb_build_object(
    'submissionId', p_submission_id,
    'changeKind', v_kind,
    'editingAllowed', case when v_kind = 'update_access' then v_result -> 'editingAllowed' else null end,
    'locked', case when v_kind = 'update_access' then v_result -> 'locked' else null end,
    'tokenId', case when v_token_id is null then null else to_jsonb(v_token_id) end,
    'deleted', case when v_kind = 'delete_response' then to_jsonb(true) else null end
  ));

  perform private.v3_emit_domain_event(
    'confirmation.window_changed',
    'confirmation_submission',
    p_submission_id::text,
    coalesce((v_result ->> 'version')::bigint, p_expected_version),
    v_canonical_operation_id,
    p_edition_id,
    null,
    v_event_payload,
    1,
    array['confirmation.tasks', 'confirmation.notifications']::text[]
  );

  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  if v_kind = 'issue_recovery' then
    return v_result || jsonb_build_object(
      'token', v_token_plaintext,
      'secretAvailable', true,
      'replayed', false
    );
  end if;

  return v_result || jsonb_build_object('replayed', false, 'secretAvailable', false);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_response_access_change(
  uuid, uuid, text, jsonb, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_response_access_change(
  uuid, uuid, text, jsonb, text, uuid, text, bigint
) to authenticated, service_role;

-- Confirmation is the only contest workflow intentionally operable through the
-- browser while the wider site remains read_only. Extend the narrow pre-request
-- allowlist to this governed response-access command; full maintenance remains
-- closed, and permanent deletion is still rejected by the command gate below.
create or replace function private.studio2_data_api_operational_gate()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $gate$
declare
  v_mode text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
  v_rpc_name text;
  v_read_only_rpc boolean := false;
begin
  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  if v_mode in ('normal', 'degraded') then return; end if;
  if v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;

  if v_path like '/rpc/%' then
    v_rpc_name := split_part(split_part(v_path, '/', 3), '?', 1);

    if v_mode = 'read_only' then
      if v_rpc_name in (
        'studio2_confirmation_round_change_preview',
        'studio2_confirmation_response_access_preview',
        'public_resolve_edit_token'
      ) then
        return;
      end if;

      if v_rpc_name in (
        'studio2_apply_confirmation_round_change',
        'studio2_apply_confirmation_response_access_change',
        'admin_update_confirmation_controls',
        'public_create_country_account_edit_token',
        'v3_submit_confirmation'
      ) then
        perform set_config('studio2.confirmation_maintenance_write', 'on', true);
        return;
      end if;
    end if;

    if v_rpc_name in (
      'studio2_apply_platform_mode_change',
      'studio2_platform_exit_database_preflight',
      'studio2_record_platform_exit_preflight'
    ) then
      return;
    end if;

    select coalesce(bool_and(proc.provolatile in ('s', 'i')), false)
    into v_read_only_rpc
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = v_rpc_name;

    if v_read_only_rpc then return; end if;
  end if;

  raise exception 'Solaris is currently %, so normal writes are unavailable', v_mode
    using errcode = '25006',
          hint = 'Use an explicitly authorized recovery operation or wait until the platform mode changes.';
end
$gate$;

create or replace function private.studio2_platform_mutation_allowed(
  p_command text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select coalesce(
    (
      select case state.mode
        when 'normal' then true
        when 'degraded' then true
        when 'read_only' then
          coalesce(p_command, '') in (
            'system.platform_mode.change',
            'system.push.retry_failed',
            'account.session.revoke'
          )
          or (
            coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on'
            and coalesce(p_command, '') in (
              'confirmation.round.status',
              'confirmation.round.editing',
              'confirmation.round.update',
              'confirmation.response.access.update',
              'confirmation.response.recovery.issue',
              'confirmation.response.recovery.invalidate'
            )
          )
        when 'maintenance' then coalesce(p_command, '') in (
          'system.platform_mode.change',
          'account.session.revoke'
        )
        else false
      end
      from public.studio2_platform_operational_state state
      where state.singleton = true
    ),
    false
  )
$allowed$;

notify pgrst, 'reload schema';

commit;

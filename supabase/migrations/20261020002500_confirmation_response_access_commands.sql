begin;

-- System V3 / Organizer O4: replace browser-owned Confirmation response access
-- mutation with exact-edition, versioned, idempotent and receipted commands.
-- Legacy RPCs remain temporarily for compatibility but V3 consumers must move
-- to this authority. Permanent response deletion is deliberately not reproduced:
-- official Confirmation history needs an explicit archival policy, not a safer-
-- looking DELETE button.
select public.v3_register_migration_contract(
  '20261020002500_confirmation_response_access_commands',
  1,
  'forward_fix_only',
  false,
  null,
  'O4 exact-edition versioned Confirmation response access and edit-token command authority'
);

create table if not exists public.studio2_confirmation_response_versions (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_confirmation_response_versions (submission_id, version)
select submission.id, 0
from public.submissions submission
on conflict (submission_id) do nothing;

alter table public.studio2_confirmation_response_versions enable row level security;
revoke all on table public.studio2_confirmation_response_versions from public, anon, authenticated;
grant all on table public.studio2_confirmation_response_versions to service_role;

create or replace function private.studio2_touch_confirmation_response_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_submission_id uuid;
begin
  if tg_table_name = 'submissions' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_submission_id := new.id;
  elsif tg_table_name = 'edit_tokens' then
    if tg_op = 'DELETE' then
      v_submission_id := old.submission_id;
    else
      v_submission_id := new.submission_id;
    end if;
  end if;

  if v_submission_id is not null
     and exists (select 1 from public.submissions s where s.id = v_submission_id) then
    insert into public.studio2_confirmation_response_versions (
      submission_id,
      version,
      updated_at
    ) values (
      v_submission_id,
      1,
      now()
    )
    on conflict (submission_id) do update
    set version = public.studio2_confirmation_response_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$touch$;

revoke all on function private.studio2_touch_confirmation_response_version()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_response_touch_version on public.submissions;
create trigger studio2_confirmation_response_touch_version
after update on public.submissions
for each row execute function private.studio2_touch_confirmation_response_version();

drop trigger if exists studio2_confirmation_edit_token_touch_response_version on public.edit_tokens;
create trigger studio2_confirmation_edit_token_touch_response_version
after insert or update or delete on public.edit_tokens
for each row execute function private.studio2_touch_confirmation_response_version();

create or replace function public.studio2_confirmation_response_access_preview(
  p_edition_id uuid,
  p_submission_id uuid,
  p_action text,
  p_token_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_submission public.submissions%rowtype;
  v_round public.submission_rounds%rowtype;
  v_edition public.editions%rowtype;
  v_version bigint := 0;
  v_token_submission_id uuid;
  v_versions integer := 0;
  v_internal_entries integer := 0;
  v_national_finals integer := 0;
  v_active_tokens integer := 0;
  v_tokens jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_risk text := 'R2';
begin
  if p_edition_id is null or p_submission_id is null then
    raise exception 'Edition and Confirmation response are required' using errcode = '22023';
  end if;
  if p_action not in ('access_update', 'token_issue', 'token_revoke', 'archive_or_delete') then
    raise exception 'Unknown Confirmation response action: %', p_action using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id;

  if v_submission.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select * into v_round from public.submission_rounds where id = v_submission.round_id;
  select * into v_edition from public.editions where id = p_edition_id;
  if v_round.id is null or v_edition.id is null or v_round.edition_id <> p_edition_id then
    raise exception 'Confirmation response canonical scope is inconsistent' using errcode = '23503';
  end if;

  select coalesce(version, 0)
  into v_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id;

  select count(*)::integer into v_versions
  from public.submission_versions version_row
  where version_row.submission_id = p_submission_id;

  select count(*)::integer into v_internal_entries
  from public.internal_entries entry
  where entry.submission_id = p_submission_id;

  select count(*)::integer into v_national_finals
  from public.national_finals national_final
  where national_final.submission_id = p_submission_id;

  select
    count(*) filter (where token.active)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', token.id,
      'tokenType', token.token_type,
      'active', token.active,
      'createdAt', token.created_at,
      'expiresAt', token.expires_at,
      'lastUsedAt', token.last_used_at,
      'useCount', token.use_count
    ) order by token.created_at desc), '[]'::jsonb)
  into v_active_tokens, v_tokens
  from public.edit_tokens token
  where token.submission_id = p_submission_id;

  if p_action = 'token_revoke' then
    if p_token_id is null then
      raise exception 'Edit-token id is required' using errcode = '22023';
    end if;
    select token.submission_id into v_token_submission_id
    from public.edit_tokens token
    where token.id = p_token_id;
    if v_token_submission_id is null or v_token_submission_id <> p_submission_id then
      raise exception 'Edit token not found for Confirmation response' using errcode = 'P0002';
    end if;
  elsif p_action = 'token_issue' then
    if v_submission.locked then
      v_blockers := v_blockers || jsonb_build_array('Unlock the response before issuing edit access.');
    end if;
    if not v_submission.editing_allowed then
      v_blockers := v_blockers || jsonb_build_array('Enable response editing before issuing an edit link.');
    end if;
    if not coalesce(v_round.editing_enabled, false) then
      v_blockers := v_blockers || jsonb_build_array('Enable editing for this Confirmation round first.');
    end if;
    if not coalesce(v_edition.editing_enabled, false) then
      v_blockers := v_blockers || jsonb_build_array('Enable Confirmation editing for this edition first.');
    end if;
  elsif p_action = 'archive_or_delete' then
    v_risk := 'R3';
    v_blockers := v_blockers || jsonb_build_array(
      'Permanent response deletion is blocked until Solaris has an explicit historical archival authority.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', v_risk,
    'action', p_action,
    'editionId', p_edition_id,
    'submissionId', p_submission_id,
    'country', v_submission.country,
    'roundId', v_submission.round_id,
    'roundName', v_round.name,
    'expectedVersion', v_version,
    'current', jsonb_build_object(
      'editingAllowed', v_submission.editing_allowed,
      'locked', v_submission.locked,
      'adminNotesPresent', v_submission.admin_notes is not null,
      'effectiveEditing', v_submission.editing_allowed and not v_submission.locked
    ),
    'activeTokenCount', coalesce(v_active_tokens, 0),
    'tokens', v_tokens,
    'dependencies', jsonb_build_object(
      'responseVersions', v_versions,
      'internalEntries', v_internal_entries,
      'nationalFinals', v_national_finals
    ),
    'destructiveAllowed', false,
    'preservationDecision', 'retain_historical_response',
    'blockers', v_blockers,
    'serverTime', statement_timestamp()
  );
end;
$preview$;

revoke all on function public.studio2_confirmation_response_access_preview(uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_response_access_preview(uuid, uuid, text, uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_response_access(
  p_edition_id uuid,
  p_submission_id uuid,
  p_editing_allowed boolean,
  p_locked boolean,
  p_admin_notes text,
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
  v_before public.submissions%rowtype;
  v_after public.submissions%rowtype;
  v_round public.submission_rounds%rowtype;
  v_edition public.editions%rowtype;
  v_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_operation_id uuid;
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_changed boolean := false;
  v_revoked_tokens integer := 0;
  v_country_id uuid;
  v_result jsonb;
begin
  if p_edition_id is null or p_submission_id is null or p_operation_id is null
     or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Edition, response, operation id and expected version are required'
      using errcode = '22023';
  end if;

  select * into v_before
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id;
  if v_before.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.response.access.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'editingAllowed', coalesce(p_editing_allowed, false),
      'locked', coalesce(p_locked, false),
      'adminNotes', v_notes,
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-response:' || p_submission_id::text, 0)
  );

  select * into v_before
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id
  for update;
  if v_before.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;

  select version into v_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id
  for update;
  if not found then
    insert into public.studio2_confirmation_response_versions (submission_id, version)
    values (p_submission_id, 0)
    on conflict (submission_id) do nothing;
    select version into v_version
    from public.studio2_confirmation_response_versions
    where submission_id = p_submission_id
    for update;
  end if;
  v_version := coalesce(v_version, 0);
  if p_expected_version <> v_version then
    raise exception 'Confirmation response changed since this review was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  select * into v_round from public.submission_rounds where id = v_before.round_id;
  select * into v_edition from public.editions where id = p_edition_id;
  if v_round.id is null or v_edition.id is null or v_round.edition_id <> p_edition_id then
    raise exception 'Confirmation response canonical scope is inconsistent' using errcode = '23503';
  end if;

  if coalesce(p_editing_allowed, false) and coalesce(p_locked, false) then
    raise exception 'A locked Confirmation response cannot be opened for editing' using errcode = '23514';
  end if;
  if coalesce(p_editing_allowed, false) and not coalesce(v_round.editing_enabled, false) then
    raise exception 'Existing-response editing is disabled for this Confirmation round' using errcode = '23514';
  end if;
  if coalesce(p_editing_allowed, false) and not coalesce(v_edition.editing_enabled, false) then
    raise exception 'Confirmation editing is disabled for this edition' using errcode = '23514';
  end if;

  v_changed :=
    v_before.editing_allowed is distinct from coalesce(p_editing_allowed, false)
    or v_before.locked is distinct from coalesce(p_locked, false)
    or v_before.admin_notes is distinct from v_notes;

  if v_changed then
    update public.submissions
    set editing_allowed = coalesce(p_editing_allowed, false),
        locked = coalesce(p_locked, false),
        admin_notes = v_notes,
        updated_at = now()
    where id = p_submission_id
      and edition_id = p_edition_id
    returning * into v_after;
  else
    v_after := v_before;
  end if;

  if not coalesce(p_editing_allowed, false) or coalesce(p_locked, false) then
    with revoked as (
      update public.edit_tokens token
      set active = false
      where token.submission_id = p_submission_id
        and token.active = true
      returning 1
    ) select count(*)::integer into v_revoked_tokens from revoked;
  end if;

  select country.id into v_country_id
  from public.countries country
  where lower(btrim(country.name)) = lower(btrim(v_before.country))
     or lower(btrim(country.short_code)) = lower(btrim(v_before.country))
  order by case when lower(btrim(country.name)) = lower(btrim(v_before.country)) then 0 else 1 end
  limit 1;

  if v_changed or v_revoked_tokens > 0 then
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
      'confirmation_response_access_updated',
      'submissions',
      p_submission_id::text,
      p_edition_id,
      v_country_id,
      jsonb_build_object(
        'editingAllowed', v_before.editing_allowed,
        'locked', v_before.locked,
        'adminNotesPresent', v_before.admin_notes is not null,
        'version', v_version
      ),
      jsonb_build_object(
        'editingAllowed', v_after.editing_allowed,
        'locked', v_after.locked,
        'adminNotesPresent', v_after.admin_notes is not null,
        'revokedEditTokens', v_revoked_tokens
      )
    );
  end if;

  select coalesce(version, v_version) into v_next_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'action', 'access_update',
    'editionId', p_edition_id,
    'submissionId', p_submission_id,
    'changed', v_changed,
    'editingAllowed', v_after.editing_allowed,
    'locked', v_after.locked,
    'revokedEditTokens', v_revoked_tokens,
    'previousVersion', v_version,
    'version', v_next_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end;
$apply$;

revoke all on function public.studio2_apply_confirmation_response_access(uuid, uuid, boolean, boolean, text, uuid, text, bigint)
  from public, anon;
grant execute on function public.studio2_apply_confirmation_response_access(uuid, uuid, boolean, boolean, text, uuid, text, bigint)
  to authenticated, service_role;

create or replace function public.studio2_issue_confirmation_edit_token(
  p_edition_id uuid,
  p_submission_id uuid,
  p_token_type text,
  p_expires_in_hours integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $issue$
declare
  v_submission public.submissions%rowtype;
  v_round public.submission_rounds%rowtype;
  v_edition public.editions%rowtype;
  v_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_operation_id uuid;
  v_token text;
  v_hash text;
  v_token_id uuid;
  v_expires_at timestamptz;
  v_revoked integer := 0;
  v_receipt_result jsonb;
begin
  if p_edition_id is null or p_submission_id is null or p_operation_id is null
     or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Edition, response, operation id and expected version are required'
      using errcode = '22023';
  end if;
  if p_token_type not in ('one_time', 'reusable') then
    raise exception 'Invalid edit-token type' using errcode = '22023';
  end if;
  if p_expires_in_hours is not null and (p_expires_in_hours < 1 or p_expires_in_hours > 8760) then
    raise exception 'Invalid edit-token expiry' using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id;
  if v_submission.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.response.edit_token.issue',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'tokenType', p_token_type,
      'expiresInHours', p_expires_in_hours,
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb) || jsonb_build_object(
      'replayed', true,
      'token', null,
      'secretAvailable', false
    );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-response:' || p_submission_id::text, 0)
  );
  select * into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id
  for update;
  if v_submission.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;

  select version into v_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id
  for update;
  v_version := coalesce(v_version, 0);
  if p_expected_version <> v_version then
    raise exception 'Confirmation response changed since edit access was reviewed. Refresh before continuing.'
      using errcode = '40001';
  end if;

  select * into v_round from public.submission_rounds where id = v_submission.round_id;
  select * into v_edition from public.editions where id = p_edition_id;
  if v_round.id is null or v_edition.id is null or v_round.edition_id <> p_edition_id then
    raise exception 'Confirmation response canonical scope is inconsistent' using errcode = '23503';
  end if;
  if v_submission.locked or not v_submission.editing_allowed then
    raise exception 'Open response editing before issuing an edit link' using errcode = '23514';
  end if;
  if not coalesce(v_round.editing_enabled, false) or not coalesce(v_edition.editing_enabled, false) then
    raise exception 'Confirmation editing is not enabled for the selected edition and round'
      using errcode = '23514';
  end if;

  with revoked as (
    update public.edit_tokens token
    set active = false
    where token.submission_id = p_submission_id
      and token.active = true
    returning 1
  ) select count(*)::integer into v_revoked from revoked;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires_at := case
    when p_expires_in_hours is null then null
    else now() + make_interval(hours => p_expires_in_hours)
  end;

  insert into public.edit_tokens (
    submission_id,
    token_hash,
    token_type,
    active,
    expires_at
  ) values (
    p_submission_id,
    v_hash,
    p_token_type,
    true,
    v_expires_at
  ) returning id into v_token_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'confirmation_edit_token_issued',
    'edit_tokens',
    v_token_id::text,
    p_edition_id,
    jsonb_build_object('activeTokensRevoked', v_revoked, 'responseVersion', v_version),
    jsonb_build_object(
      'submissionId', p_submission_id,
      'tokenId', v_token_id,
      'tokenType', p_token_type,
      'expiresAt', v_expires_at
    )
  );

  select coalesce(version, v_version) into v_next_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id;

  -- Never persist the plaintext edit secret in the operation receipt. If the
  -- first response is lost, reconciliation proves issuance but does not reveal
  -- the secret again; the organizer can deliberately issue a replacement.
  v_receipt_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'action', 'token_issue',
    'editionId', p_edition_id,
    'submissionId', p_submission_id,
    'tokenId', v_token_id,
    'tokenType', p_token_type,
    'expiresAt', v_expires_at,
    'revokedPreviousTokens', v_revoked,
    'previousVersion', v_version,
    'version', v_next_version,
    'operationId', v_operation_id,
    'secretAvailable', false
  );

  perform private.studio2_complete_operation(v_operation_id, v_receipt_result);
  return v_receipt_result || jsonb_build_object(
    'token', v_token,
    'secretAvailable', true,
    'replayed', false
  );
end;
$issue$;

revoke all on function public.studio2_issue_confirmation_edit_token(uuid, uuid, text, integer, uuid, text, bigint)
  from public, anon;
grant execute on function public.studio2_issue_confirmation_edit_token(uuid, uuid, text, integer, uuid, text, bigint)
  to authenticated, service_role;

create or replace function public.studio2_invalidate_confirmation_edit_token(
  p_edition_id uuid,
  p_submission_id uuid,
  p_token_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $invalidate$
declare
  v_submission public.submissions%rowtype;
  v_token public.edit_tokens%rowtype;
  v_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_operation_id uuid;
  v_changed boolean := false;
  v_result jsonb;
begin
  if p_edition_id is null or p_submission_id is null or p_token_id is null
     or p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Edition, response, token, operation id and expected version are required'
      using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id;
  if v_submission.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.edit_tokens token
    where token.id = p_token_id
      and token.submission_id = p_submission_id
  ) then
    raise exception 'Edit token not found for Confirmation response' using errcode = 'P0002';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.response.edit_token.revoke',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'submissionId', p_submission_id,
      'tokenId', p_token_id,
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-response:' || p_submission_id::text, 0)
  );
  select * into v_submission
  from public.submissions submission
  where submission.id = p_submission_id
    and submission.edition_id = p_edition_id
  for update;
  if v_submission.id is null then
    raise exception 'Confirmation response not found for edition' using errcode = 'P0002';
  end if;

  select version into v_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id
  for update;
  v_version := coalesce(v_version, 0);
  if p_expected_version <> v_version then
    raise exception 'Confirmation response changed since edit access was reviewed. Refresh before continuing.'
      using errcode = '40001';
  end if;

  select * into v_token
  from public.edit_tokens token
  where token.id = p_token_id
    and token.submission_id = p_submission_id
  for update;
  if v_token.id is null then
    raise exception 'Edit token not found for Confirmation response' using errcode = 'P0002';
  end if;

  if v_token.active then
    update public.edit_tokens set active = false where id = p_token_id;
    v_changed := true;
  end if;

  if v_changed then
    insert into public.admin_audit_log (
      actor_id,
      action,
      table_name,
      record_id,
      edition_id,
      before_data,
      after_data
    ) values (
      auth.uid(),
      'confirmation_edit_token_revoked',
      'edit_tokens',
      p_token_id::text,
      p_edition_id,
      jsonb_build_object(
        'submissionId', p_submission_id,
        'active', true,
        'tokenType', v_token.token_type,
        'responseVersion', v_version
      ),
      jsonb_build_object('submissionId', p_submission_id, 'active', false)
    );
  end if;

  select coalesce(version, v_version) into v_next_version
  from public.studio2_confirmation_response_versions
  where submission_id = p_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'action', 'token_revoke',
    'editionId', p_edition_id,
    'submissionId', p_submission_id,
    'tokenId', p_token_id,
    'changed', v_changed,
    'previousVersion', v_version,
    'version', v_next_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end;
$invalidate$;

revoke all on function public.studio2_invalidate_confirmation_edit_token(uuid, uuid, uuid, uuid, text, bigint)
  from public, anon;
grant execute on function public.studio2_invalidate_confirmation_edit_token(uuid, uuid, uuid, uuid, text, bigint)
  to authenticated, service_role;

-- Preserve the existing emergency Confirmation maintenance behavior while the
-- public website is read_only. Only the response access command gets this
-- exception because the legacy access-control RPC already had it. Token issue
-- and revoke remain normal/degraded-only, so this migration does not broaden
-- maintenance-mode secret issuance.
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
  select state.mode into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable' using errcode = '25006';
  end if;
  if v_mode in ('normal', 'degraded') then return; end if;
  if v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;

  if v_path like '/rpc/%' then
    v_rpc_name := split_part(split_part(v_path, '/', 3), '?', 1);

    if v_mode = 'read_only' then
      if v_rpc_name in (
        'studio2_confirmation_round_change_preview',
        'public_resolve_edit_token'
      ) then
        return;
      end if;

      if v_rpc_name in (
        'studio2_apply_confirmation_round_change',
        'studio2_apply_confirmation_response_access',
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
end;
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
              'confirmation.response.access.update'
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
  );
$allowed$;

comment on function public.studio2_confirmation_response_access_preview(uuid, uuid, text, uuid) is
  'O4 exact-edition response access/token/destructive-action preflight. Never returns token hashes or plaintext secrets.';
comment on function public.studio2_apply_confirmation_response_access(uuid, uuid, boolean, boolean, text, uuid, text, bigint) is
  'O4 versioned/idempotent Confirmation response access mutation with operation receipt and exact-edition scope.';
comment on function public.studio2_issue_confirmation_edit_token(uuid, uuid, text, integer, uuid, text, bigint) is
  'O4 one-time plaintext edit-token issuance. Receipt persists metadata only; replay never redisplays the secret.';
comment on function public.studio2_invalidate_confirmation_edit_token(uuid, uuid, uuid, uuid, text, bigint) is
  'O4 versioned/idempotent edit-token invalidation bound to exact edition + response + token.';

notify pgrst, 'reload schema';
commit;

begin;

-- Complete the #599 command boundary for the non-public draft lifecycle while
-- preserving the established V2 target/surface/content validators as the only
-- canonical writers during migration.
select public.v3_register_migration_contract(
  '20261020003000_v3_official_communications_draft_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Official Communications create/update/superseding-draft mutations with explicit scope, CAS and idempotent operation receipts'
);

create or replace function private.v3_notice_draft_scope(
  p_scope_kind text,
  p_edition_id uuid,
  p_subject_id uuid default null
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $scope$
begin
  if p_scope_kind = 'edition' then
    if p_edition_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'scopeKind', 'edition',
      'editionId', p_edition_id,
      'subjectType', 'official_notice',
      'subjectId', p_subject_id
    ));
  end if;

  if p_scope_kind = 'global' then
    if p_edition_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'scopeKind', 'global',
      'subjectType', 'official_notice',
      'subjectId', p_subject_id
    ));
  end if;

  raise exception using errcode = '22023', message = 'VALIDATION';
end
$scope$;

revoke all on function private.v3_notice_draft_scope(text, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_require_notice_create_scope(
  p_scope_kind text,
  p_edition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $scope$
begin
  if p_scope_kind = 'edition' then
    if p_edition_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    perform private.studio2_require_communications_access(p_edition_id);
    return;
  end if;

  if p_scope_kind = 'global' then
    if p_edition_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if not public.has_role(auth.uid(), 'organizer'::public.app_role) then
      raise exception using errcode = '42501', message = 'AUTHORIZATION';
    end if;
    return;
  end if;

  raise exception using errcode = '22023', message = 'VALIDATION';
end
$scope$;

revoke all on function private.v3_require_notice_create_scope(text, uuid)
  from public, anon, authenticated;

create or replace function private.v3_normalize_uuid_set(p_values uuid[])
returns uuid[]
language sql
immutable
set search_path = pg_catalog
as $normalize$
  select coalesce(
    array_agg(value order by value),
    '{}'::uuid[]
  )
  from (
    select distinct unnest(coalesce(p_values, '{}'::uuid[])) as value
  ) normalized
  where value is not null
$normalize$;

create or replace function private.v3_normalize_text_set(p_values text[])
returns text[]
language sql
immutable
set search_path = pg_catalog
as $normalize$
  select coalesce(
    array_agg(value order by value),
    '{}'::text[]
  )
  from (
    select distinct btrim(raw_value) as value
    from unnest(coalesce(p_values, '{}'::text[])) raw_value
    where nullif(btrim(raw_value), '') is not null
  ) normalized
$normalize$;

revoke all on function private.v3_normalize_uuid_set(uuid[]) from public, anon, authenticated;
revoke all on function private.v3_normalize_text_set(text[]) from public, anon, authenticated;

create or replace function public.v3_create_notice_draft(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_type text,
  p_title text,
  p_body text,
  p_severity text,
  p_audience text,
  p_audience_group text,
  p_country_ids uuid[],
  p_acknowledgement_required boolean,
  p_display_surfaces text[],
  p_supersedes_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $create$
declare
  v_actor uuid := auth.uid();
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_notice public.studio2_official_notices%rowtype;
  v_country_ids uuid[] := private.v3_normalize_uuid_set(p_country_ids);
  v_surfaces text[] := private.v3_normalize_text_set(p_display_surfaces);
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform private.v3_require_notice_create_scope(p_scope_kind, p_edition_id);
  v_scope := private.v3_notice_draft_scope(p_scope_kind, p_edition_id, null);

  -- If this is explicitly a superseding draft, prove the source belongs to the
  -- same command scope before operation identity can be claimed.
  if p_supersedes_id is not null then
    select notice.*
    into v_notice
    from public.studio2_official_notices notice
    where notice.id = p_supersedes_id;
    if v_notice.id is null then
      raise exception using errcode = 'P0002', message = 'VALIDATION';
    end if;
    perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);
  end if;

  v_request := jsonb_strip_nulls(jsonb_build_object(
    'noticeType', p_notice_type,
    'title', btrim(coalesce(p_title, '')),
    'body', btrim(coalesce(p_body, '')),
    'severity', p_severity,
    'audience', p_audience,
    'audienceGroup', p_audience_group,
    'countryIds', to_jsonb(v_country_ids),
    'acknowledgementRequired', coalesce(p_acknowledgement_required, false),
    'displaySurfaces', to_jsonb(v_surfaces),
    'supersedesId', p_supersedes_id
  ));

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'notice.draft.create',
    'R1',
    v_scope,
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Commit repeats create-scope authorization. Supersedes validation is also
  -- repeated by the established V2 writer inside this same transaction.
  perform private.v3_require_notice_create_scope(p_scope_kind, p_edition_id);

  v_notice := public.studio2_create_notice_draft_v2(
    p_edition_id,
    p_notice_type,
    p_title,
    p_body,
    p_severity,
    p_audience,
    p_audience_group,
    v_country_ids,
    p_acknowledgement_required,
    v_surfaces,
    p_supersedes_id
  );

  if v_notice.id is null or v_notice.edition_id is distinct from p_edition_id then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'noticeId', v_notice.id,
    'editionId', v_notice.edition_id,
    'scopeKind', p_scope_kind,
    'action', 'draft.create',
    'stateVersion', v_notice.revision,
    'state', v_notice.status,
    'notice', to_jsonb(v_notice),
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$create$;

revoke all on function public.v3_create_notice_draft(
  text, uuid, text, text, text, text, text, text, uuid[], boolean, text[], uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.v3_create_notice_draft(
  text, uuid, text, text, text, text, text, text, uuid[], boolean, text[], uuid, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.v3_update_notice_draft(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_notice_type text,
  p_title text,
  p_body text,
  p_severity text,
  p_audience text,
  p_audience_group text,
  p_country_ids uuid[],
  p_acknowledgement_required boolean,
  p_display_surfaces text[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $update$
declare
  v_actor uuid := auth.uid();
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_notice public.studio2_official_notices%rowtype;
  v_country_ids uuid[] := private.v3_normalize_uuid_set(p_country_ids);
  v_surfaces text[] := private.v3_normalize_text_set(p_display_surfaces);
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_expected_revision is null
     or p_expected_revision < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_scope := private.v3_notice_draft_scope(p_scope_kind, p_edition_id, p_notice_id);

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;
  if v_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);

  v_request := jsonb_strip_nulls(jsonb_build_object(
    'noticeId', p_notice_id,
    'expectedRevision', p_expected_revision,
    'noticeType', p_notice_type,
    'title', btrim(coalesce(p_title, '')),
    'body', btrim(coalesce(p_body, '')),
    'severity', p_severity,
    'audience', p_audience,
    'audienceGroup', p_audience_group,
    'countryIds', to_jsonb(v_country_ids),
    'acknowledgementRequired', coalesce(p_acknowledgement_required, false),
    'displaySurfaces', to_jsonb(v_surfaces)
  ));

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'notice.draft.update',
    'R1',
    v_scope,
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select notice.*
  into v_notice
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
  for update;
  if v_notice.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_notice, p_scope_kind, p_edition_id);
  if v_notice.revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'Reload the current communication revision before saving.';
  end if;

  v_notice := public.studio2_update_notice_draft_v2(
    p_notice_id,
    p_notice_type,
    p_title,
    p_body,
    p_severity,
    p_audience,
    p_audience_group,
    v_country_ids,
    p_acknowledgement_required,
    v_surfaces
  );

  if v_notice.id is distinct from p_notice_id
     or v_notice.edition_id is distinct from p_edition_id then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'noticeId', v_notice.id,
    'editionId', v_notice.edition_id,
    'scopeKind', p_scope_kind,
    'action', 'draft.update',
    'stateVersion', v_notice.revision,
    'state', v_notice.status,
    'notice', to_jsonb(v_notice),
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$update$;

revoke all on function public.v3_update_notice_draft(
  text, uuid, uuid, integer, text, text, text, text, text, text, uuid[], boolean, text[], uuid, text, uuid
) from public, anon;
grant execute on function public.v3_update_notice_draft(
  text, uuid, uuid, integer, text, text, text, text, text, text, uuid[], boolean, text[], uuid, text, uuid
) to authenticated, service_role;

create or replace function public.v3_create_superseding_notice_draft(
  p_scope_kind text,
  p_edition_id uuid,
  p_notice_id uuid,
  p_expected_revision integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $supersede$
declare
  v_actor uuid := auth.uid();
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_source public.studio2_official_notices%rowtype;
  v_notice public.studio2_official_notices%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_expected_revision is null
     or p_expected_revision < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_scope := private.v3_notice_draft_scope(p_scope_kind, p_edition_id, p_notice_id);

  select notice.*
  into v_source
  from public.studio2_official_notices notice
  where notice.id = p_notice_id;
  if v_source.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_source, p_scope_kind, p_edition_id);

  v_request := jsonb_build_object(
    'noticeId', p_notice_id,
    'expectedRevision', p_expected_revision
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'notice.superseding_draft.create',
    'R1',
    v_scope,
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select notice.*
  into v_source
  from public.studio2_official_notices notice
  where notice.id = p_notice_id
  for update;
  if v_source.id is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  perform private.v3_assert_notice_command_scope(v_source, p_scope_kind, p_edition_id);
  if v_source.revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'Reload the published communication before creating its replacement.';
  end if;

  v_notice := public.studio2_create_superseding_notice_draft(p_notice_id);

  if v_notice.id is null
     or v_notice.edition_id is distinct from p_edition_id
     or v_notice.supersedes_id is distinct from p_notice_id then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'sourceNoticeId', p_notice_id,
    'noticeId', v_notice.id,
    'editionId', v_notice.edition_id,
    'scopeKind', p_scope_kind,
    'action', 'superseding_draft.create',
    'sourceRevision', p_expected_revision,
    'stateVersion', v_notice.revision,
    'state', v_notice.status,
    'notice', to_jsonb(v_notice),
    'operationId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$supersede$;

revoke all on function public.v3_create_superseding_notice_draft(
  text, uuid, uuid, integer, uuid, text, uuid
) from public, anon;
grant execute on function public.v3_create_superseding_notice_draft(
  text, uuid, uuid, integer, uuid, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

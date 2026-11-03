begin;

-- Terra Solaris Governance TG4 authoritative document commands. Browser roles
-- have no table DML; all consequential mutation flows through V3 operation,
-- idempotency, receipt and DomainEvent infrastructure.

-- Correct the artifact lifecycle constraint from the state wave: a superseded
-- representation remains a real generated artifact and therefore keeps its
-- generation timestamp and content hash.
alter table public.world_document_artifacts
  drop constraint world_document_artifacts_ready_check;
alter table public.world_document_artifacts
  add constraint world_document_artifacts_materialized_check check (
    (status in ('ready','superseded') and generated_at is not null and content_hash is not null)
    or (status in ('pending','failed') and generated_at is null and content_hash is null)
  );

create or replace function private.world_document_actor_person_v1(p_organization_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $actor$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select term_row.holder_person_id
  into v_person_id
  from public.world_office_terms term_row
  join public.world_organization_offices office_row on office_row.id = term_row.office_id
  where office_row.organization_id = p_organization_id
    and term_row.holder_user_id = auth.uid()
    and term_row.status = 'active'
    and term_row.ends_at is null
  order by term_row.starts_at desc, term_row.id
  limit 1;

  if v_person_id is not null then
    return v_person_id;
  end if;

  select control_row.person_id
  into v_person_id
  from public.world_country_control_terms control_row
  where control_row.user_id = auth.uid()
    and control_row.ended_at is null
    and control_row.person_id is not null
  order by control_row.started_at desc, control_row.id
  limit 1;

  return v_person_id;
end
$actor$;
revoke all on function private.world_document_actor_person_v1(uuid) from public, anon, authenticated;

create or replace function private.world_document_validate_provision_payload(p_provisions jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate$
begin
  if p_provisions is null then
    return;
  end if;
  if jsonb_typeof(p_provisions) <> 'array'
     or jsonb_array_length(p_provisions) > 1000
     or pg_column_size(p_provisions) > 1048576 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_provisions) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(item ->> 'semanticKey'), '') is null
      or lower(btrim(item ->> 'semanticKey')) !~ '^[a-z0-9]+(?:[.:-][a-z0-9]+)*$'
      or nullif(btrim(item ->> 'anchor'), '') is null
      or lower(btrim(item ->> 'anchor')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or coalesce((item ->> 'sortOrder')::integer, -1) < 0
      or coalesce(item -> 'bodyStructured', '{}'::jsonb) is null
      or jsonb_typeof(coalesce(item -> 'bodyStructured', '{}'::jsonb)) <> 'object'
      or coalesce(item ->> 'status', 'active') not in ('active','repealed','omitted')
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if exists (
    select 1
    from (
      select lower(btrim(item ->> 'semanticKey')) key, count(*) count
      from jsonb_array_elements(p_provisions) item
      group by 1
      having count(*) > 1
    ) duplicate
  ) or exists (
    select 1
    from (
      select lower(btrim(item ->> 'anchor')) anchor, count(*) count
      from jsonb_array_elements(p_provisions) item
      group by 1
      having count(*) > 1
    ) duplicate
  ) then
    raise exception using errcode = '23505', message = 'VALIDATION';
  end if;
end
$validate$;
revoke all on function private.world_document_validate_provision_payload(jsonb) from public, anon, authenticated;

create or replace function private.world_document_replace_draft_provisions(
  p_document_id uuid,
  p_version_id uuid,
  p_provisions jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $replace$
begin
  perform private.world_document_validate_provision_payload(coalesce(p_provisions, '[]'::jsonb));

  if exists (
    select 1 from public.world_document_versions version_row
    where version_row.id = p_version_id
      and (version_row.document_id <> p_document_id or version_row.publication_state <> 'draft')
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  insert into public.world_document_provisions(document_id, semantic_key)
  select p_document_id, lower(btrim(item ->> 'semanticKey'))
  from jsonb_array_elements(coalesce(p_provisions, '[]'::jsonb)) item
  on conflict (document_id, semantic_key) do nothing;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_provisions, '[]'::jsonb)) item
    where nullif(btrim(item ->> 'parentSemanticKey'), '') is not null
      and not exists (
        select 1
        from public.world_document_provisions parent_row
        where parent_row.document_id = p_document_id
          and parent_row.semantic_key = lower(btrim(item ->> 'parentSemanticKey'))
      )
  ) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  delete from public.world_document_version_provisions
  where document_version_id = p_version_id;

  insert into public.world_document_version_provisions(
    document_id,
    document_version_id,
    provision_id,
    parent_provision_id,
    display_label,
    heading,
    body_structured,
    body_plain_text,
    sort_order,
    anchor,
    version_status
  )
  select
    p_document_id,
    p_version_id,
    provision_row.id,
    parent_row.id,
    nullif(btrim(item ->> 'displayLabel'), ''),
    nullif(btrim(item ->> 'heading'), ''),
    coalesce(item -> 'bodyStructured', '{}'::jsonb),
    coalesce(item ->> 'bodyPlainText', ''),
    (item ->> 'sortOrder')::integer,
    lower(btrim(item ->> 'anchor')),
    coalesce(item ->> 'status', 'active')
  from jsonb_array_elements(coalesce(p_provisions, '[]'::jsonb)) item
  join public.world_document_provisions provision_row
    on provision_row.document_id = p_document_id
   and provision_row.semantic_key = lower(btrim(item ->> 'semanticKey'))
  left join public.world_document_provisions parent_row
    on parent_row.document_id = p_document_id
   and parent_row.semantic_key = lower(btrim(item ->> 'parentSemanticKey'));

  if exists (
    with recursive ancestry as (
      select
        row.provision_id,
        row.parent_provision_id,
        array[row.provision_id]::uuid[] as path,
        false as cycle
      from public.world_document_version_provisions row
      where row.document_version_id = p_version_id
      union all
      select
        ancestry.provision_id,
        parent_row.parent_provision_id,
        ancestry.path || parent_row.provision_id,
        parent_row.provision_id = any(ancestry.path)
      from ancestry
      join public.world_document_version_provisions parent_row
        on parent_row.document_version_id = p_version_id
       and parent_row.provision_id = ancestry.parent_provision_id
      where ancestry.parent_provision_id is not null
        and not ancestry.cycle
    )
    select 1 from ancestry where cycle limit 1
  ) then
    raise exception using errcode = '23514', message = 'VALIDATION';
  end if;
end
$replace$;
revoke all on function private.world_document_replace_draft_provisions(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.world_create_document_v1(
  p_organization_id uuid,
  p_slug text,
  p_document_type text,
  p_title text,
  p_visibility text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $create_document$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_document_id uuid;
  v_actor_person_id uuid;
  v_result jsonb;
begin
  if not public.world_access_allowed('world.document.manage', p_organization_id, null, null, null, null) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_actor_person_id := private.world_document_actor_person_v1(p_organization_id);
  if v_actor_person_id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not exists (select 1 from public.world_organizations where id = p_organization_id)
     or lower(btrim(coalesce(p_slug,''))) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_document_type not in ('charter','rulebook','annex','treaty','protocol','procedural_rules','report','minutes','communique','other')
     or nullif(btrim(coalesce(p_title,'')), '') is null
     or p_visibility not in ('public','members','private') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.create',
    'R2',
    jsonb_build_object('organizationId', p_organization_id, 'subjectType', 'world_document'),
    jsonb_build_object(
      'organizationId', p_organization_id,
      'slug', lower(btrim(p_slug)),
      'documentType', p_document_type,
      'title', btrim(p_title),
      'visibility', p_visibility
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  insert into public.world_documents(
    organization_id, slug, document_type, title, status, visibility, record_class
  ) values (
    p_organization_id, lower(btrim(p_slug)), p_document_type, btrim(p_title), 'active', p_visibility, 'working'
  ) returning id into v_document_id;

  perform private.v3_emit_domain_event(
    'world.document.created',
    'world_document',
    v_document_id::text,
    1,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'documentId', v_document_id,
      'actorPersonId', v_actor_person_id,
      'slug', lower(btrim(p_slug)),
      'documentType', p_document_type,
      'revision', 1
    ),
    1,
    array['world.documents.projection']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', v_document_id,
    'revision', 1,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$create_document$;

create or replace function public.world_create_document_version_v1(
  p_document_id uuid,
  p_title text,
  p_structured_content jsonb,
  p_plain_text text,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_source_version_id uuid,
  p_source_description text,
  p_source_provenance jsonb,
  p_provisions jsonb,
  p_expected_document_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $create_version$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_document public.world_documents%rowtype;
  v_source public.world_document_versions%rowtype;
  v_version_id uuid;
  v_version_number integer;
  v_result jsonb;
begin
  select * into v_document from public.world_documents where id = p_document_id;
  if v_document.id is null
     or not public.world_access_allowed('world.document.manage', v_document.organization_id, null, null, 'document', v_document.id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  perform private.world_document_validate_provision_payload(p_provisions);
  if nullif(btrim(coalesce(p_title,'')), '') is null
     or jsonb_typeof(coalesce(p_structured_content, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_source_provenance, '{}'::jsonb)) <> 'object'
     or p_expected_document_revision is null
     or (p_effective_to is not null and (p_effective_from is null or p_effective_to <= p_effective_from)) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.version.create',
    'R2',
    jsonb_build_object('organizationId', v_document.organization_id, 'documentId', p_document_id, 'subjectType', 'world_document_version'),
    jsonb_build_object(
      'documentId', p_document_id,
      'title', btrim(p_title),
      'structuredContent', coalesce(p_structured_content, '{}'::jsonb),
      'plainText', coalesce(p_plain_text, ''),
      'effectiveFrom', p_effective_from,
      'effectiveTo', p_effective_to,
      'sourceVersionId', p_source_version_id,
      'sourceDescription', p_source_description,
      'sourceProvenance', coalesce(p_source_provenance, '{}'::jsonb),
      'provisions', p_provisions,
      'expectedDocumentRevision', p_expected_document_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  select * into v_document from public.world_documents where id = p_document_id for update;
  if v_document.revision is distinct from p_expected_document_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if p_source_version_id is not null then
    select * into v_source
    from public.world_document_versions
    where id = p_source_version_id and document_id = p_document_id;
    if v_source.id is null or v_source.publication_state = 'draft' then
      raise exception using errcode = '23503', message = 'VALIDATION';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_version_number
  from public.world_document_versions
  where document_id = p_document_id;

  insert into public.world_document_versions(
    document_id, version_number, title, structured_content, plain_text,
    effective_from, effective_to, publication_state, supersedes_version_id,
    source_description, source_provenance, record_class, revision
  ) values (
    p_document_id, v_version_number, btrim(p_title), coalesce(p_structured_content, '{}'::jsonb),
    coalesce(p_plain_text, ''), p_effective_from, p_effective_to, 'draft', p_source_version_id,
    p_source_description, coalesce(p_source_provenance, '{}'::jsonb), 'working', 1
  ) returning id into v_version_id;

  if p_provisions is not null then
    perform private.world_document_replace_draft_provisions(p_document_id, v_version_id, p_provisions);
  elsif p_source_version_id is not null then
    insert into public.world_document_version_provisions(
      document_id, document_version_id, provision_id, parent_provision_id,
      display_label, heading, body_structured, body_plain_text, sort_order, anchor, version_status
    )
    select
      p_document_id, v_version_id, source_row.provision_id, source_row.parent_provision_id,
      source_row.display_label, source_row.heading, source_row.body_structured,
      source_row.body_plain_text, source_row.sort_order, source_row.anchor, source_row.version_status
    from public.world_document_version_provisions source_row
    where source_row.document_version_id = p_source_version_id;
  end if;

  update public.world_documents
  set revision = revision + 1, updated_at = now()
  where id = p_document_id;

  perform private.v3_emit_domain_event(
    'world.document.version_created',
    'world_document_version',
    v_version_id::text,
    1,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'organizationId', v_document.organization_id,
      'documentId', p_document_id,
      'versionId', v_version_id,
      'versionNumber', v_version_number,
      'sourceVersionId', p_source_version_id,
      'revision', 1
    ),
    1,
    array['world.documents.projection']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', p_document_id,
    'documentRevision', p_expected_document_revision + 1,
    'versionId', v_version_id,
    'versionNumber', v_version_number,
    'versionRevision', 1,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$create_version$;

create or replace function public.world_update_document_version_draft_v1(
  p_version_id uuid,
  p_title text,
  p_structured_content jsonb,
  p_plain_text text,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_source_description text,
  p_source_provenance jsonb,
  p_provisions jsonb,
  p_expected_version_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $update_draft$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_version public.world_document_versions%rowtype;
  v_document public.world_documents%rowtype;
  v_new_revision bigint;
  v_result jsonb;
begin
  select version_row.*, document_row.organization_id
  into v_version
  from public.world_document_versions version_row
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_row.id = p_version_id;
  select document_row.* into v_document
  from public.world_documents document_row
  join public.world_document_versions version_row on version_row.document_id = document_row.id
  where version_row.id = p_version_id;

  if v_version.id is null
     or not public.world_access_allowed('world.document.manage', v_document.organization_id, null, null, 'document', v_document.id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  perform private.world_document_validate_provision_payload(coalesce(p_provisions, '[]'::jsonb));
  if p_expected_version_revision is null
     or nullif(btrim(coalesce(p_title,'')), '') is null
     or jsonb_typeof(coalesce(p_structured_content, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_source_provenance, '{}'::jsonb)) <> 'object'
     or (p_effective_to is not null and (p_effective_from is null or p_effective_to <= p_effective_from)) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.version.update_draft',
    'R2',
    jsonb_build_object('organizationId', v_document.organization_id, 'documentId', v_document.id, 'versionId', p_version_id, 'subjectType', 'world_document_version'),
    jsonb_build_object(
      'versionId', p_version_id,
      'title', btrim(p_title),
      'structuredContent', coalesce(p_structured_content, '{}'::jsonb),
      'plainText', coalesce(p_plain_text, ''),
      'effectiveFrom', p_effective_from,
      'effectiveTo', p_effective_to,
      'sourceDescription', p_source_description,
      'sourceProvenance', coalesce(p_source_provenance, '{}'::jsonb),
      'provisions', coalesce(p_provisions, '[]'::jsonb),
      'expectedVersionRevision', p_expected_version_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  select * into v_version
  from public.world_document_versions
  where id = p_version_id
  for update;
  if v_version.publication_state <> 'draft' then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if v_version.revision is distinct from p_expected_version_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  v_new_revision := v_version.revision + 1;
  update public.world_document_versions
  set title = btrim(p_title),
      structured_content = coalesce(p_structured_content, '{}'::jsonb),
      plain_text = coalesce(p_plain_text, ''),
      effective_from = p_effective_from,
      effective_to = p_effective_to,
      source_description = p_source_description,
      source_provenance = coalesce(p_source_provenance, '{}'::jsonb),
      revision = v_new_revision,
      updated_at = now()
  where id = p_version_id;

  perform private.world_document_replace_draft_provisions(v_version.document_id, p_version_id, p_provisions);

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', v_version.document_id,
    'versionId', p_version_id,
    'versionRevision', v_new_revision,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$update_draft$;

create or replace function public.world_publish_document_version_v1(
  p_document_id uuid,
  p_version_id uuid,
  p_expected_document_revision bigint,
  p_expected_version_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $publish$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_document public.world_documents%rowtype;
  v_version public.world_document_versions%rowtype;
  v_previous public.world_document_versions%rowtype;
  v_actor_person_id uuid;
  v_hash text;
  v_provisions jsonb;
  v_new_version_revision bigint;
  v_new_document_revision bigint;
  v_result jsonb;
begin
  select * into v_document from public.world_documents where id = p_document_id;
  if v_document.id is null
     or not public.world_access_allowed('world.document.publish', v_document.organization_id, null, null, 'document', p_document_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_actor_person_id := private.world_document_actor_person_v1(v_document.organization_id);
  if v_actor_person_id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_expected_document_revision is null or p_expected_version_revision is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.version.publish',
    'R3',
    jsonb_build_object('organizationId', v_document.organization_id, 'documentId', p_document_id, 'versionId', p_version_id, 'subjectType', 'world_document_version'),
    jsonb_build_object(
      'documentId', p_document_id,
      'versionId', p_version_id,
      'expectedDocumentRevision', p_expected_document_revision,
      'expectedVersionRevision', p_expected_version_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  perform private.studio2_require_fresh_auth(300);

  select * into v_document from public.world_documents where id = p_document_id for update;
  select * into v_version
  from public.world_document_versions
  where id = p_version_id and document_id = p_document_id
  for update;

  if v_version.id is null or v_version.publication_state <> 'draft' then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if v_document.revision is distinct from p_expected_document_revision
     or v_version.revision is distinct from p_expected_version_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if v_version.version_number is distinct from (
    select max(version_number) from public.world_document_versions where document_id = p_document_id
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if v_version.effective_from is null or v_version.effective_from > now() or v_version.effective_to is not null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'semanticKey', provision_row.semantic_key,
    'parentSemanticKey', parent_row.semantic_key,
    'displayLabel', version_provision.display_label,
    'heading', version_provision.heading,
    'bodyStructured', version_provision.body_structured,
    'bodyPlainText', version_provision.body_plain_text,
    'sortOrder', version_provision.sort_order,
    'anchor', version_provision.anchor,
    'status', version_provision.version_status
  ) order by version_provision.sort_order, provision_row.semantic_key), '[]'::jsonb)
  into v_provisions
  from public.world_document_version_provisions version_provision
  join public.world_document_provisions provision_row on provision_row.id = version_provision.provision_id
  left join public.world_document_provisions parent_row on parent_row.id = version_provision.parent_provision_id
  where version_provision.document_version_id = p_version_id;

  v_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'documentId', p_document_id,
        'versionNumber', v_version.version_number,
        'title', v_version.title,
        'structuredContent', v_version.structured_content,
        'plainText', v_version.plain_text,
        'effectiveFrom', v_version.effective_from,
        'sourceDescription', v_version.source_description,
        'sourceProvenance', v_version.source_provenance,
        'provisions', v_provisions
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_document.current_version_id is not null then
    select * into v_previous
    from public.world_document_versions
    where id = v_document.current_version_id and document_id = p_document_id
    for update;
    if v_previous.id is null or v_previous.publication_state <> 'published'
       or v_previous.effective_from is null
       or v_version.effective_from <= v_previous.effective_from then
      raise exception using errcode = '23514', message = 'STATE_CHANGED';
    end if;

    update public.world_document_versions
    set publication_state = 'superseded',
        effective_to = v_version.effective_from,
        superseded_by_version_id = p_version_id,
        record_class = 'permanent',
        updated_at = now()
    where id = v_previous.id;
  end if;

  v_new_version_revision := v_version.revision + 1;
  update public.world_document_versions
  set publication_state = 'published',
      published_at = now(),
      content_hash = v_hash,
      record_class = 'official',
      revision = v_new_version_revision,
      updated_at = now()
  where id = p_version_id;

  v_new_document_revision := v_document.revision + 1;
  update public.world_documents
  set current_version_id = p_version_id,
      title = v_version.title,
      record_class = 'official',
      revision = v_new_document_revision,
      updated_at = now()
  where id = p_document_id;

  if v_previous.id is not null then
    perform private.v3_emit_domain_event(
      'world.document.version_superseded',
      'world_document_version',
      v_previous.id::text,
      v_previous.revision,
      v_operation_id,
      null,
      null,
      jsonb_build_object(
        'organizationId', v_document.organization_id,
        'documentId', p_document_id,
        'versionId', v_previous.id,
        'supersededByVersionId', p_version_id,
        'effectiveTo', v_version.effective_from,
        'contentHash', v_previous.content_hash
      ),
      1,
      array['world.documents.archive','world.documents.search','world.documents.projection']::text[]
    );
  end if;

  perform private.v3_emit_domain_event(
    'world.document.version_published',
    'world_document_version',
    p_version_id::text,
    v_new_version_revision,
    v_operation_id,
    null,
    null,
    jsonb_build_object(
      'organizationId', v_document.organization_id,
      'documentId', p_document_id,
      'versionId', p_version_id,
      'versionNumber', v_version.version_number,
      'actorPersonId', v_actor_person_id,
      'contentHash', v_hash,
      'effectiveFrom', v_version.effective_from,
      'documentRevision', v_new_document_revision,
      'versionRevision', v_new_version_revision
    ),
    1,
    array['world.documents.archive','world.documents.search','world.documents.projection']::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', p_document_id,
    'documentRevision', v_new_document_revision,
    'versionId', p_version_id,
    'versionNumber', v_version.version_number,
    'versionRevision', v_new_version_revision,
    'contentHash', v_hash,
    'supersededVersionId', v_previous.id,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$publish$;

revoke all on function public.world_create_document_v1(uuid,text,text,text,text,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_create_document_v1(uuid,text,text,text,text,uuid,text,uuid)
  to authenticated, service_role;

revoke all on function public.world_create_document_version_v1(uuid,text,jsonb,text,timestamptz,timestamptz,uuid,text,jsonb,jsonb,bigint,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_create_document_version_v1(uuid,text,jsonb,text,timestamptz,timestamptz,uuid,text,jsonb,jsonb,bigint,uuid,text,uuid)
  to authenticated, service_role;

revoke all on function public.world_update_document_version_draft_v1(uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_update_document_version_draft_v1(uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid)
  to authenticated, service_role;

revoke all on function public.world_publish_document_version_v1(uuid,uuid,bigint,bigint,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_publish_document_version_v1(uuid,uuid,bigint,bigint,uuid,text,uuid)
  to authenticated, service_role;

comment on function public.world_create_document_v1(uuid,text,text,text,text,uuid,text,uuid) is
  'TG4 canonical idempotent command for creating a generic institutional document Work.';
comment on function public.world_create_document_version_v1(uuid,text,jsonb,text,timestamptz,timestamptz,uuid,text,jsonb,jsonb,bigint,uuid,text,uuid) is
  'TG4 canonical idempotent command for creating the next mutable document Version, optionally copying stable provisions from a published source Version.';
comment on function public.world_update_document_version_draft_v1(uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid) is
  'TG4 canonical expected-revision command for replacing mutable draft text and version-specific provision representation.';
comment on function public.world_publish_document_version_v1(uuid,uuid,bigint,bigint,uuid,text,uuid) is
  'TG4 canonical R3 publication command. Publishes deterministic immutable legal text, atomically supersedes prior current text, emits semantic DomainEvents and returns the V3 operation receipt.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-commands',
      1,
      'forward_fix_only',
      false,
      null,
      'Add idempotent world document creation, version creation/draft replacement and R3 publication commands using expected revisions, deterministic content hashes, operation receipts and semantic DomainEvents.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;

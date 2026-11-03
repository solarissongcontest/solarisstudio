begin;

-- TG4 hardening found during stacked review before first deployment.
-- Keep the original additive state/command migrations intact and close runtime
-- invariants here so clean replay and foundation->TG4 upgrade converge on one
-- canonical final schema.

-- A draft based on prior legal text must identify the document's current legal
-- predecessor. This keeps supersedes_version_id semantic instead of turning it
-- into a generic arbitrary copy-source pointer.
create or replace function private.world_document_draft_predecessor_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_current_version_id uuid;
begin
  if new.publication_state = 'draft' then
    select current_version_id into v_current_version_id
    from public.world_documents
    where id = new.document_id;
    if new.supersedes_version_id is distinct from v_current_version_id then
      raise exception using errcode = '23514', message = 'DRAFT_PREDECESSOR_MISMATCH';
    end if;
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_draft_predecessor_guard() from public, anon, authenticated;
drop trigger if exists world_document_versions_draft_predecessor_guard on public.world_document_versions;
create trigger world_document_versions_draft_predecessor_guard
before insert or update of document_id, publication_state, supersedes_version_id
on public.world_document_versions
for each row execute function private.world_document_draft_predecessor_guard();

-- Stable provision identity is semantic history. Lifecycle metadata may evolve,
-- but the owning Work and semantic key cannot be rewritten after creation.
create or replace function private.world_document_provision_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  if new.document_id is distinct from old.document_id
     or new.semantic_key is distinct from old.semantic_key then
    raise exception using errcode = '55000', message = 'PROVISION_IDENTITY_IMMUTABLE';
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_provision_identity_guard() from public, anon, authenticated;
drop trigger if exists world_document_provisions_identity_guard on public.world_document_provisions;
create trigger world_document_provisions_identity_guard
before update on public.world_document_provisions
for each row execute function private.world_document_provision_identity_guard();

-- Version-specific provision representation is mutable only while its Version
-- is a draft. Published/superseded/historical legal text cannot be edited via a
-- service-role accident or future command bug.
create or replace function private.world_document_version_provision_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_version_id uuid := case when tg_op = 'DELETE' then old.document_version_id else new.document_version_id end;
  v_state text;
begin
  select publication_state into v_state
  from public.world_document_versions
  where id = v_version_id;
  if v_state is distinct from 'draft' then
    raise exception using errcode = '55000', message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$guard$;
revoke all on function private.world_document_version_provision_mutation_guard() from public, anon, authenticated;
drop trigger if exists world_document_version_provisions_mutation_guard on public.world_document_version_provisions;
create trigger world_document_version_provisions_mutation_guard
before insert or update or delete on public.world_document_version_provisions
for each row execute function private.world_document_version_provision_mutation_guard();

-- A version hierarchy cannot point at a stable parent that is absent from that
-- same historical Version. Deferral permits one multi-row replacement to build
-- the whole tree before validation.
create or replace function private.world_document_version_parent_presence_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  if new.parent_provision_id is not null
     and not exists (
       select 1
       from public.world_document_version_provisions parent_row
       where parent_row.document_version_id = new.document_version_id
         and parent_row.provision_id = new.parent_provision_id
     ) then
    raise exception using errcode = '23514', message = 'PROVISION_PARENT_NOT_IN_VERSION';
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_version_parent_presence_guard() from public, anon, authenticated;
drop trigger if exists world_document_version_provisions_parent_presence_guard on public.world_document_version_provisions;
create constraint trigger world_document_version_provisions_parent_presence_guard
after insert or update of document_version_id, parent_provision_id
on public.world_document_version_provisions
deferrable initially deferred
for each row execute function private.world_document_version_parent_presence_guard();

-- Qualify artifact status against the outer artifact row. The joined document
-- also has a status column, so leaving this unqualified would fail closed too
-- aggressively for authenticated public/member artifact readers.
drop policy if exists world_document_artifacts_authenticated_read on public.world_document_artifacts;
create policy world_document_artifacts_authenticated_read on public.world_document_artifacts
for select to authenticated
using (exists (
  select 1
  from public.world_document_versions version_row
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_row.id = world_document_artifacts.document_version_id
    and (
      (
        world_document_artifacts.status = 'ready'
        and version_row.publication_state in ('published','superseded','historical_source')
        and (
          document_row.visibility = 'public'
          or (document_row.visibility = 'members' and public.world_document_member_allowed_v1(document_row.organization_id))
        )
      )
      or public.world_access_allowed('world.document.manage', document_row.organization_id, null, null, 'document', document_row.id)
      or public.world_access_allowed('world.document.publish', document_row.organization_id, null, null, 'document', document_row.id)
    )
));

-- Replace the draft command with an exact rowtype lookup. The original stacked
-- implementation selected one extra organization column into a Version rowtype;
-- this keeps the authorization lookup explicit and runtime-safe.
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
  select * into v_version
  from public.world_document_versions
  where id = p_version_id;
  if v_version.id is not null then
    select * into v_document
    from public.world_documents
    where id = v_version.document_id;
  end if;

  if v_version.id is null
     or v_document.id is null
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

-- Reassert publication with an exact legal predecessor check. A draft can be
-- copied only from the current legal Version; if the Work changes underneath it,
-- expected_revision/predecessor checks return STATE_CHANGED rather than silently
-- publishing a stale constitutional branch.
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
  if v_version.supersedes_version_id is distinct from v_document.current_version_id then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
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

-- Replace two bounded read projections with explicit rowtype lookups. This also
-- keeps public/member responses free of source provenance unless manage/publish
-- authority is present.
create or replace function public.world_get_document_v1(
  p_organization_slug text,
  p_document_slug text,
  p_version_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $document$
declare
  v_document public.world_documents%rowtype;
  v_organization public.world_organizations%rowtype;
  v_version public.world_document_versions%rowtype;
  v_can_manage boolean := false;
  v_provisions jsonb;
  v_history jsonb;
  v_actions jsonb;
begin
  select document_row.* into v_document
  from public.world_documents document_row
  join public.world_organizations organization_row on organization_row.id = document_row.organization_id
  where organization_row.slug = p_organization_slug
    and document_row.slug = p_document_slug
  limit 1;
  if v_document.id is not null then
    select * into v_organization
    from public.world_organizations
    where id = v_document.organization_id;
  end if;

  if v_document.id is null or not private.world_document_can_read_v1(v_document.id) then
    return null;
  end if;
  v_can_manage := private.world_document_can_manage_v1(v_document.id);

  if p_version_number is null then
    if v_document.current_version_id is not null then
      select * into v_version from public.world_document_versions where id = v_document.current_version_id;
    elsif v_can_manage then
      select * into v_version
      from public.world_document_versions
      where document_id = v_document.id
      order by version_number desc
      limit 1;
    end if;
  else
    select * into v_version
    from public.world_document_versions
    where document_id = v_document.id and version_number = p_version_number;
  end if;

  if v_version.id is not null and v_version.publication_state = 'draft' and not v_can_manage then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provisionId', provision_row.id,
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
  where version_provision.document_version_id = v_version.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', history_row.id,
    'versionNumber', history_row.version_number,
    'title', history_row.title,
    'publicationState', history_row.publication_state,
    'effectiveFrom', history_row.effective_from,
    'effectiveTo', history_row.effective_to,
    'publishedAt', history_row.published_at,
    'contentHash', history_row.content_hash,
    'recordClass', history_row.record_class,
    'supersedesVersionId', history_row.supersedes_version_id,
    'supersededByVersionId', history_row.superseded_by_version_id
  ) order by history_row.version_number desc), '[]'::jsonb)
  into v_history
  from public.world_document_versions history_row
  where history_row.document_id = v_document.id
    and (
      history_row.publication_state in ('published','superseded','historical_source')
      or (v_can_manage and history_row.publication_state = 'draft')
    );

  v_actions := jsonb_build_object(
    'manage', v_can_manage,
    'publish', case when auth.uid() is null then false else
      public.world_access_allowed('world.document.publish', v_document.organization_id, null, null, 'document', v_document.id)
    end
  );

  return jsonb_build_object(
    'documentId', v_document.id,
    'organization', jsonb_build_object(
      'organizationId', v_organization.id,
      'slug', v_organization.slug,
      'officialName', v_organization.official_name,
      'shortName', v_organization.short_name
    ),
    'slug', v_document.slug,
    'documentType', v_document.document_type,
    'title', v_document.title,
    'status', v_document.status,
    'visibility', v_document.visibility,
    'recordClass', v_document.record_class,
    'revision', case when v_can_manage then v_document.revision else null end,
    'version', case when v_version.id is null then null else jsonb_build_object(
      'versionId', v_version.id,
      'versionNumber', v_version.version_number,
      'title', v_version.title,
      'structuredContent', v_version.structured_content,
      'plainText', v_version.plain_text,
      'effectiveFrom', v_version.effective_from,
      'effectiveTo', v_version.effective_to,
      'publicationState', v_version.publication_state,
      'publishedAt', v_version.published_at,
      'contentHash', v_version.content_hash,
      'recordClass', v_version.record_class,
      'revision', case when v_can_manage then v_version.revision else null end,
      'provisions', v_provisions
    ) end,
    'history', v_history,
    'allowedActions', v_actions,
    'serverTime', now()
  );
end
$document$;

create or replace function public.world_get_document_archive_v1(
  p_organization_slug text,
  p_document_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $archive$
declare
  v_document public.world_documents%rowtype;
  v_organization public.world_organizations%rowtype;
  v_can_manage boolean := false;
  v_versions jsonb;
begin
  select document_row.* into v_document
  from public.world_documents document_row
  join public.world_organizations organization_row on organization_row.id = document_row.organization_id
  where organization_row.slug = p_organization_slug
    and document_row.slug = p_document_slug
  limit 1;
  if v_document.id is not null then
    select * into v_organization
    from public.world_organizations
    where id = v_document.organization_id;
  end if;

  if v_document.id is null or not private.world_document_can_read_v1(v_document.id) then
    return null;
  end if;
  v_can_manage := private.world_document_can_manage_v1(v_document.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', version_row.id,
    'versionNumber', version_row.version_number,
    'title', version_row.title,
    'publicationState', version_row.publication_state,
    'effectiveFrom', version_row.effective_from,
    'effectiveTo', version_row.effective_to,
    'publishedAt', version_row.published_at,
    'contentHash', version_row.content_hash,
    'recordClass', version_row.record_class,
    'supersedesVersionId', version_row.supersedes_version_id,
    'supersededByVersionId', version_row.superseded_by_version_id,
    'sourceDescription', case when v_can_manage then version_row.source_description else null end,
    'sourceProvenance', case when v_can_manage then version_row.source_provenance else null end,
    'fullTextAvailable', length(btrim(version_row.plain_text)) > 0 or version_row.structured_content <> '{}'::jsonb
  ) order by version_row.version_number desc), '[]'::jsonb)
  into v_versions
  from public.world_document_versions version_row
  where version_row.document_id = v_document.id
    and (
      version_row.publication_state in ('published','superseded','historical_source')
      or (v_can_manage and version_row.publication_state = 'draft')
    );

  return jsonb_build_object(
    'archiveOwner', 'world_document_versions+domain_events',
    'documentId', v_document.id,
    'organizationId', v_organization.id,
    'organizationSlug', v_organization.slug,
    'documentSlug', v_document.slug,
    'versions', v_versions,
    'serverTime', now()
  );
end
$archive$;

revoke all on function public.world_update_document_version_draft_v1(uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_update_document_version_draft_v1(uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid)
  to authenticated, service_role;
revoke all on function public.world_publish_document_version_v1(uuid,uuid,bigint,bigint,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_publish_document_version_v1(uuid,uuid,bigint,bigint,uuid,text,uuid)
  to authenticated, service_role;
revoke all on function public.world_get_document_v1(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.world_get_document_v1(text,text,integer)
  to anon, authenticated, service_role;
revoke all on function public.world_get_document_archive_v1(text,text)
  from public, anon, authenticated;
grant execute on function public.world_get_document_archive_v1(text,text)
  to anon, authenticated, service_role;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-hardening',
      1,
      'forward_fix_only',
      false,
      null,
      'Harden TG4 predecessor semantics, provision immutability/hierarchy, artifact RLS qualification and runtime-safe draft/document Archive projections before first adoption.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;

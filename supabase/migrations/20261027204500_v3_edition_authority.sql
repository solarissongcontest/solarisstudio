begin;

select public.v3_register_migration_contract(
  'v3.edition.canonical-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Consolidate edition creation, edition-owned metadata and global confirmation editing behind governed actor-scoped commands; retire legacy edition writers; make direct public.editions DML unavailable to API roles; and preserve explicitly sanctioned internal projection writers.'
);

-- Production was inspected before this constraint was added: neither slug nor
-- edition_number currently has duplicates. Keep routing identity and the human
-- contest number unambiguous at the database boundary.
create unique index if not exists editions_edition_number_unique
  on public.editions(edition_number)
  where edition_number is not null;

create or replace function public.v3_create_edition(
  p_edition_number integer,
  p_name text,
  p_year integer,
  p_host_country_id uuid,
  p_host_city text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_city text := nullif(btrim(coalesce(p_host_city, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_slug text;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_row public.editions%rowtype;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if v_actor is null or not public.studio2_access_allowed('edition.manage', null, false) then
    raise exception 'AUTHORIZATION: global edition.manage required to create an edition'
      using errcode = '42501';
  end if;
  if p_edition_number is null or p_edition_number < 1 or v_name is null
     or length(v_name) > 160 or length(coalesce(v_city, '')) > 160
     or length(coalesce(v_reason, '')) < 5 then
    raise exception 'VALIDATION: edition number, name and reason are required'
      using errcode = '22023';
  end if;
  if p_year is not null and (p_year < 1900 or p_year > 9999) then
    raise exception 'VALIDATION: edition year is outside the supported range'
      using errcode = '22023';
  end if;
  if p_host_country_id is not null
     and not exists (select 1 from public.countries where id = p_host_country_id) then
    raise exception 'VALIDATION: host country does not exist' using errcode = '22023';
  end if;

  v_slug := 'ssc-' || p_edition_number::text;
  v_fingerprint := private.studio2_request_fingerprint(
    'edition.create',
    'R2',
    jsonb_build_object('editionNumber', p_edition_number),
    jsonb_build_object(
      'actor', v_actor,
      'name', v_name,
      'year', p_year,
      'slug', v_slug,
      'hostCountryId', p_host_country_id,
      'hostCity', v_city,
      'reason', v_reason
    )
  );
  v_operation_id := (
    substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||
    substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||
    substr(v_fingerprint,21,12)
  )::uuid;
  v_claim := private.studio2_claim_operation(
    v_operation_id,
    'edition.create:' || v_fingerprint,
    v_operation_id,
    'edition.create',
    'R2',
    jsonb_build_object('editionNumber', p_edition_number),
    jsonb_build_object('name', v_name, 'year', p_year, 'slug', v_slug,
      'hostCountryId', p_host_country_id, 'hostCity', v_city, 'reason', v_reason)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing edition create operation'
        using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v3-edition-create:' || p_edition_number::text, 0));
  if exists (
    select 1 from public.editions
    where edition_number = p_edition_number or slug = v_slug
  ) then
    raise exception 'STATE_CHANGED: edition number or slug already exists' using errcode = '23505';
  end if;

  insert into public.editions(
    edition_number, name, year, slug, host_country_id, host_city,
    status, published, editing_enabled, data_revision
  ) values (
    p_edition_number, v_name, p_year, v_slug, p_host_country_id, v_city,
    'draft', false, true, 1
  ) returning * into v_row;

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_row.id, 'edition.metadata_changed', v_actor, 'edition', v_row.id::text,
    jsonb_build_object(
      'changeKind', 'edition.create',
      'operationId', v_operation_id,
      'changedFields', jsonb_build_array('edition_number','name','year','slug','host_country_id','host_city'),
      'fromRevision', 0,
      'toRevision', v_row.data_revision,
      'reason', v_reason
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed', 'edition', v_row.id::text, v_row.data_revision,
    v_operation_id, v_row.id, null,
    jsonb_build_object(
      'changeKind', 'created',
      'changedFields', jsonb_build_array('edition_number','name','year','slug','host_country_id','host_city'),
      'revision', v_row.data_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'replayed', false,
    'changed', true,
    'edition', to_jsonb(v_row)
  );
  return private.studio2_complete_operation(v_operation_id, v_result);
end
$command$;

revoke all on function public.v3_create_edition(integer,text,integer,uuid,text,text)
  from public, anon, service_role;
grant execute on function public.v3_create_edition(integer,text,integer,uuid,text,text)
  to authenticated;

create or replace function public.v3_apply_edition_metadata_change(
  p_edition_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text;
  v_changed_fields jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb
     or length(coalesce(v_reason, '')) < 5 then
    raise exception 'VALIDATION: edition, expected revision, non-empty patch and reason required'
      using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition'
      using errcode = '42501';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name','description','event_date','year') then
      raise exception 'VALIDATION: % is not edition-owned metadata', v_key using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'name' and (
    jsonb_typeof(p_patch -> 'name') <> 'string'
    or length(btrim(p_patch ->> 'name')) < 1
    or length(btrim(p_patch ->> 'name')) > 160
  ) then
    raise exception 'VALIDATION: edition name must contain 1-160 characters' using errcode = '22023';
  end if;
  if p_patch ? 'description' and jsonb_typeof(p_patch -> 'description') not in ('string','null') then
    raise exception 'VALIDATION: description must be text or null' using errcode = '22023';
  end if;
  if p_patch ? 'description' and length(coalesce(p_patch ->> 'description','')) > 6000 then
    raise exception 'VALIDATION: description is too long' using errcode = '22023';
  end if;
  if p_patch ? 'year' and jsonb_typeof(p_patch -> 'year') not in ('number','null') then
    raise exception 'VALIDATION: year must be numeric or null' using errcode = '22023';
  end if;
  if p_patch ? 'event_date' and jsonb_typeof(p_patch -> 'event_date') not in ('string','null') then
    raise exception 'VALIDATION: event date must be an ISO date or null' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'edition.metadata.change', 'R1', jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expectedRevision', p_expected_revision,
      'patch', p_patch, 'reason', v_reason)
  );
  v_operation_id := (
    substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||
    substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||
    substr(v_fingerprint,21,12)
  )::uuid;
  v_claim := private.studio2_claim_operation(
    v_operation_id,
    'edition.metadata:' || v_fingerprint,
    v_operation_id,
    'edition.metadata.change',
    'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('expectedRevision', p_expected_revision, 'patch', p_patch, 'reason', v_reason)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing edition metadata operation'
        using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed', true);
  end if;

  select * into v_current
  from public.editions
  where id = p_edition_id
  for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  if v_current.data_revision <> p_expected_revision then
    raise exception 'STATE_CHANGED: edition changed since this edit was loaded' using errcode = 'PT409';
  end if;

  v_next := jsonb_populate_record(v_current, p_patch);
  if v_next.year is not null and (v_next.year < 1900 or v_next.year > 9999) then
    raise exception 'VALIDATION: edition year is outside the supported range' using errcode = '22023';
  end if;

  update public.editions
  set name = case when p_patch ? 'name' then btrim(v_next.name) else name end,
      description = case when p_patch ? 'description' then nullif(btrim(v_next.description), '') else description end,
      event_date = case when p_patch ? 'event_date' then v_next.event_date else event_date end,
      year = case when p_patch ? 'year' then v_next.year else year end,
      data_revision = data_revision + 1
  where id = p_edition_id and data_revision = p_expected_revision
  returning * into v_next;
  if not found then
    raise exception 'STATE_CHANGED: edition changed immediately before apply' using errcode = 'PT409';
  end if;

  select coalesce(jsonb_agg(to_jsonb(key) order by key), '[]'::jsonb)
  into v_changed_fields
  from jsonb_object_keys(p_patch) as fields(key);

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id, 'edition.metadata_changed', v_actor, 'edition', p_edition_id::text,
    jsonb_build_object(
      'changeKind', 'edition.metadata.change',
      'operationId', v_operation_id,
      'changedFields', v_changed_fields,
      'fromRevision', p_expected_revision,
      'toRevision', v_next.data_revision,
      'reason', v_reason
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed', 'edition', p_edition_id::text, v_next.data_revision,
    v_operation_id, p_edition_id, null,
    jsonb_build_object(
      'changeKind', 'metadata',
      'changedFields', v_changed_fields,
      'previousRevision', p_expected_revision,
      'revision', v_next.data_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'replayed', false,
    'changed', true,
    'edition', to_jsonb(v_next)
  );
  return private.studio2_complete_operation(v_operation_id, v_result);
end
$command$;

revoke all on function public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)
  to authenticated;

create or replace function public.v3_apply_edition_editing_change(
  p_edition_id uuid,
  p_expected_enabled boolean,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or p_expected_enabled is null or p_enabled is null
     or length(coalesce(v_reason, '')) < 5 then
    raise exception 'VALIDATION: edition, reviewed editing state, target and reason required'
      using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition'
      using errcode = '42501';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'edition.editing.change', 'R2', jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expectedEnabled', p_expected_enabled,
      'enabled', p_enabled, 'reason', v_reason)
  );
  v_operation_id := (
    substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||
    substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||
    substr(v_fingerprint,21,12)
  )::uuid;
  v_claim := private.studio2_claim_operation(
    v_operation_id,
    'edition.editing:' || v_fingerprint,
    v_operation_id,
    'edition.editing.change',
    'R2',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('expectedEnabled', p_expected_enabled, 'enabled', p_enabled, 'reason', v_reason)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing edition editing operation'
        using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed', true);
  end if;

  select * into v_current
  from public.editions
  where id = p_edition_id
  for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  if v_current.editing_enabled is distinct from p_expected_enabled then
    raise exception 'STATE_CHANGED: edition editing state changed since review' using errcode = 'PT409';
  end if;

  if p_enabled = p_expected_enabled then
    v_result := jsonb_build_object(
      'ok', true, 'operationId', v_operation_id, 'replayed', false,
      'changed', false, 'edition', to_jsonb(v_current)
    );
    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  update public.editions
  set editing_enabled = p_enabled,
      data_revision = data_revision + 1
  where id = p_edition_id and editing_enabled is not distinct from p_expected_enabled
  returning * into v_next;
  if not found then
    raise exception 'STATE_CHANGED: edition editing state changed immediately before apply'
      using errcode = 'PT409';
  end if;

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id, 'edition.metadata_changed', v_actor, 'edition', p_edition_id::text,
    jsonb_build_object(
      'changeKind', 'edition.editing.change',
      'operationId', v_operation_id,
      'changedFields', jsonb_build_array('editing_enabled'),
      'fromRevision', v_current.data_revision,
      'toRevision', v_next.data_revision,
      'reason', v_reason
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed', 'edition', p_edition_id::text, v_next.data_revision,
    v_operation_id, p_edition_id, null,
    jsonb_build_object(
      'changeKind', 'editing',
      'changedFields', jsonb_build_array('editing_enabled'),
      'previousRevision', v_current.data_revision,
      'revision', v_next.data_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'replayed', false,
    'changed', true,
    'edition', to_jsonb(v_next)
  );
  return private.studio2_complete_operation(v_operation_id, v_result);
end
$command$;

revoke all on function public.v3_apply_edition_editing_change(uuid,boolean,boolean,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_editing_change(uuid,boolean,boolean,text)
  to authenticated;

-- Forward-harden the already accepted visual command so edition-owned visual
-- changes participate in the same monotonically increasing edition revision and
-- emit a compact event payload rather than copying the full patch into outbox.
create or replace function public.v3_apply_edition_visual_change(
  p_edition_id uuid,
  p_expected jsonb,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_key text;
  v_changed_fields jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or jsonb_typeof(p_patch) is distinct from 'object'
     or p_patch = '{}'::jsonb or jsonb_typeof(p_expected) is distinct from 'object'
     or length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'VALIDATION: edition, expected visual state, patch and reason required' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('theme_colors','artwork_url','artwork_storage_path','logo')
       or not (p_expected ? v_key) then
      raise exception 'VALIDATION: unsupported visual field or missing comparison: %', v_key using errcode = '22023';
    end if;
  end loop;
  for v_key in select jsonb_object_keys(p_expected) loop
    if v_key not in ('theme_colors','artwork_url','artwork_storage_path','logo','name','slug','theme_id') then
      raise exception 'VALIDATION: unsupported comparison field' using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'theme_colors' and jsonb_typeof(p_patch -> 'theme_colors') not in ('object','null') then
    raise exception 'VALIDATION: theme colors must be an object or null' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition' using errcode = '42501';
  end if;

  v_fingerprint := private.studio2_request_fingerprint('edition.visual.change', 'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expected', p_expected, 'patch', p_patch, 'reason', p_reason));
  v_operation_id := (substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||substr(v_fingerprint,21,12))::uuid;
  v_claim := private.studio2_claim_operation(v_operation_id, 'edition.visual:'||v_fingerprint,
    v_operation_id, 'edition.visual.change', 'R1', jsonb_build_object('editionId',p_edition_id),
    jsonb_build_object('expected',p_expected,'patch',p_patch,'reason',p_reason));
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing operation' using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed',true);
  end if;

  select * into v_current from public.editions where id = p_edition_id for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  for v_key in select jsonb_object_keys(p_expected) loop
    if (to_jsonb(v_current) -> v_key) is distinct from (p_expected -> v_key) then
      raise exception 'STATE_CHANGED: reviewed edition visual state is stale' using errcode = 'PT409';
    end if;
  end loop;
  v_next := jsonb_populate_record(v_current,p_patch);
  update public.editions
  set theme_colors=v_next.theme_colors,
      artwork_url=v_next.artwork_url,
      artwork_storage_path=v_next.artwork_storage_path,
      logo=v_next.logo,
      data_revision=data_revision + 1
  where id=p_edition_id
  returning * into v_next;

  select coalesce(jsonb_agg(to_jsonb(key) order by key), '[]'::jsonb)
  into v_changed_fields
  from jsonb_object_keys(p_patch) as fields(key);

  insert into public.studio2_contest_events(edition_id,type,actor_user_id,entity_type,entity_id,payload)
    values(p_edition_id,'edition.metadata_changed',v_actor,'edition',p_edition_id::text,
      jsonb_build_object('changeKind','edition.visual.change','operationId',v_operation_id,
        'changedFields',v_changed_fields,'fromRevision',v_current.data_revision,
        'toRevision',v_next.data_revision,'reason',p_reason));
  perform private.v3_emit_domain_event('edition.changed','edition',p_edition_id::text,v_next.data_revision,
    v_operation_id,p_edition_id,null,jsonb_build_object('changeKind','visual',
      'changedFields',v_changed_fields,'previousRevision',v_current.data_revision,
      'revision',v_next.data_revision),1,array[]::text[]);
  v_result := jsonb_build_object('ok',true,'edition',to_jsonb(v_next),'operationId',v_operation_id,'replayed',false,'changed',true);
  return private.studio2_complete_operation(v_operation_id,v_result);
end
$command$;

revoke all on function public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)
  to authenticated;

-- Retire obsolete Confirmations edition writers. The old signatures remain as
-- explicit compatibility tombstones so a stale client fails closed instead of
-- silently becoming a second edition authority.
create or replace function public.admin_confirmation_set_edition_editing(_id uuid, _enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use v3_apply_edition_editing_change' using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_set_edition_editing(uuid,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.admin_confirmation_set_round_editing(_id uuid, _enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_apply_confirmation_round_change' using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_set_round_editing(uuid,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.admin_confirmation_delete_edition(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: editions are retired through canonical lifecycle/archive state, not destructive deletion' using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_delete_edition(uuid)
  from public, anon, authenticated, service_role;

-- These functions are not peer edition authorities. They are deterministic
-- internal consequences of canonical participant/country/show operations.
-- They must keep working after API-role DML is revoked, but callers must never
-- invoke the trigger helpers directly.
alter function public.bump_edition_data_revision() security definer;
alter function public.bump_edition_data_revision() set search_path = pg_catalog, public, private;
revoke all on function public.bump_edition_data_revision()
  from public, anon, authenticated, service_role;

alter function public.bump_country_edition_revisions() security definer;
alter function public.bump_country_edition_revisions() set search_path = pg_catalog, public, private;
revoke all on function public.bump_country_edition_revisions()
  from public, anon, authenticated, service_role;

alter function public.sync_edition_publication_from_shows() security definer;
alter function public.sync_edition_publication_from_shows() set search_path = pg_catalog, public, private;
revoke all on function public.sync_edition_publication_from_shows()
  from public, anon, authenticated, service_role;

alter function public.sync_edition_year_from_event_date() security definer;
alter function public.sync_edition_year_from_event_date() set search_path = pg_catalog, public, private;
revoke all on function public.sync_edition_year_from_event_date()
  from public, anon, authenticated, service_role;

-- User-delegated governed commands must remain user-delegated. service_role is
-- not edition authority and may not invoke these without a bound user session.
revoke execute on function public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)
  from service_role;
revoke execute on function public.studio2_execute_host_operation(uuid,text,text,uuid,uuid,bigint,jsonb)
  from service_role;

-- Cut over public.editions itself. Security-definer commands and trigger
-- consequences above execute with their owners' narrow database privileges;
-- browser/API credentials no longer possess raw edition DML even if RLS drifts.
drop policy if exists "editions capability write insert" on public.editions;
drop policy if exists "editions capability write update" on public.editions;
drop policy if exists "editions capability write delete" on public.editions;
revoke insert, update, delete, truncate on public.editions from anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

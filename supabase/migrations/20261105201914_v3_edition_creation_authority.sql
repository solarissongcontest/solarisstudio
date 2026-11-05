begin;

select public.v3_register_migration_contract(
  'v3.edition.creation-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern private Edition creation, deny raw API INSERT authority and route compatible Confirmation draft creation through the same atomic command; preserve existing metadata and lifecycle owners.'
);

-- Fail closed on duplicate historical numbers; never silently merge or renumber editions.
create unique index if not exists editions_edition_number_unique
  on public.editions(edition_number)
  where edition_number is not null;

create or replace function public.v3_create_edition(
  p_edition_number integer,
  p_name text,
  p_year integer,
  p_host_country_id uuid,
  p_host_city text,
  p_reason text,
  p_description text default null,
  p_editing_enabled boolean default true
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
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
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
     or length(coalesce(v_reason, '')) < 5
     or length(coalesce(v_description, '')) > 20000 or p_editing_enabled is null then
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
      'description', v_description, 'editingEnabled', p_editing_enabled,
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
      'description', v_description, 'editingEnabled', p_editing_enabled,
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
    description, status, published, editing_enabled, data_revision
  ) values (
    p_edition_number, v_name, p_year, v_slug, p_host_country_id, v_city,
    v_description, 'draft', false, p_editing_enabled, 1
  ) returning * into v_row;

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_row.id, 'edition.metadata_changed', v_actor, 'edition', v_row.id::text,
    jsonb_build_object(
      'changeKind', 'edition.create',
      'operationId', v_operation_id,
      'changedFields', jsonb_build_array('edition_number','name','year','slug','host_country_id','host_city','description','editing_enabled'),
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
      'changedFields', jsonb_build_array('edition_number','name','year','slug','host_country_id','host_city','description','editing_enabled'),
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

revoke all on function public.v3_create_edition(integer,text,integer,uuid,text,text,text,boolean)
  from public, anon, service_role;
grant execute on function public.v3_create_edition(integer,text,integer,uuid,text,text,text,boolean)
  to authenticated;


-- Legacy Confirmation creation retains description/editing semantics, but cannot
-- manufacture active/completed publication state outside canonical lifecycle.
-- Keep its existing update branch unchanged for the separately tracked cutover.
do $compatibility$
declare
  v_definition text;
  v_old text := $old$    insert into public.editions(name, edition_number, description, status, editing_enabled, slug, published)
    values (
      v_name,
      v_number,
      v_description,
      v_status,
      v_editing,
      'ssc-' || v_number::text,
      v_status <> 'draft'
    )
    returning id into v_id;$old$;
  v_new text := $new$    if v_status <> 'draft' then
      raise exception 'Create a private draft, then use canonical Edition lifecycle/publication commands' using errcode='22023';
    end if;
    v_id := (public.v3_create_edition(v_number, v_name, null, null, null,
      'Create private Edition through Confirmation compatibility', v_description, v_editing)->'edition'->>'id')::uuid;$new$;
begin
  select pg_get_functiondef('public.admin_confirmation_save_edition(jsonb)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Unexpected Confirmation edition creator; refusing competing-authority patch';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$compatibility$;

-- Revoking table INSERT alone does not remove column-level INSERT grants.
revoke insert on public.editions from public,anon,authenticated,service_role;
do $columns$
declare c record;
begin
 for c in select attname from pg_attribute where attrelid='public.editions'::regclass and attnum>0 and not attisdropped loop
   execute format('revoke insert (%I) on public.editions from public,anon,authenticated,service_role',c.attname);
 end loop;
end
$columns$;

-- Effective invocation role, not caller-controlled JWT/transaction markers.
-- PostgreSQL owners remain responsible for sanctioned internal commands.
create or replace function private.v3_guard_edition_creation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,pg_temp as $guard$
begin
 if current_user in ('anon','authenticated','service_role','authenticator') then
   raise exception 'Edition creation requires its governed command' using errcode='42501';
 end if;
 return new;
end
$guard$;
revoke all on function private.v3_guard_edition_creation() from public,anon,authenticated,service_role;
create trigger v3_guard_edition_creation before insert on public.editions
for each row execute function private.v3_guard_edition_creation();
notify pgrst, 'reload schema';
commit;

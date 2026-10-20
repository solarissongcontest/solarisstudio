begin;

-- Solaris Studio V3 / System #1068
-- Govern the Organizer All Editions create + make-private boundary without
-- introducing a second archive/lifecycle authority.
select public.v3_register_migration_contract(
  'v3.organizer.all-editions-lifecycle',
  1,
  'forward_fix_only',
  false,
  null,
  'Add receipted edition draft creation and atomic make-private orchestration. Permanent browser deletion is retired in favour of canonical archive.'
);

create table if not exists private.studio2_all_editions_versions (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

revoke all on table private.studio2_all_editions_versions
  from public, anon, authenticated;
grant all on table private.studio2_all_editions_versions to service_role;

insert into private.studio2_all_editions_versions (edition_id, version, updated_at)
select edition.id, 1, now()
from public.editions edition
on conflict (edition_id) do nothing;

create or replace function private.studio2_touch_all_editions_version(
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

  insert into private.studio2_all_editions_versions (edition_id, version, updated_at)
  values (p_edition_id, 1, now())
  on conflict (edition_id) do update
  set version = case
        when p_increment then private.studio2_all_editions_versions.version + 1
        else private.studio2_all_editions_versions.version
      end,
      updated_at = case
        when p_increment then now()
        else private.studio2_all_editions_versions.updated_at
      end
  returning version into v_version;

  return v_version;
end
$touch$;

revoke all on function private.studio2_touch_all_editions_version(uuid, boolean)
  from public, anon, authenticated;

create or replace function private.studio2_all_editions_edition_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if tg_op = 'INSERT' then
    perform private.studio2_touch_all_editions_version(new.id, false);
  elsif old.name is distinct from new.name
     or old.slug is distinct from new.slug
     or old.edition_number is distinct from new.edition_number
     or old.year is distinct from new.year
     or old.host_city is distinct from new.host_city
     or old.host_country_id is distinct from new.host_country_id
     or old.status is distinct from new.status
     or old.published is distinct from new.published then
    perform private.studio2_touch_all_editions_version(new.id, true);
  end if;
  return new;
end
$trigger$;

revoke all on function private.studio2_all_editions_edition_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_all_editions_edition_version on public.editions;
create trigger studio2_all_editions_edition_version
after insert or update of name, slug, edition_number, year, host_city, host_country_id, status, published
on public.editions
for each row execute function private.studio2_all_editions_edition_version_trigger();

create or replace function private.studio2_all_editions_publication_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT' then v_old_edition := old.edition_id; end if;
  if tg_op <> 'DELETE' then v_new_edition := new.edition_id; end if;

  if v_old_edition is not null then
    perform private.studio2_touch_all_editions_version(v_old_edition, true);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_touch_all_editions_version(v_new_edition, true);
  end if;

  return coalesce(new, old);
end
$trigger$;

revoke all on function private.studio2_all_editions_publication_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_all_editions_publication_version
  on public.studio2_show_publication_controls;
create trigger studio2_all_editions_publication_version
after insert or update or delete on public.studio2_show_publication_controls
for each row execute function private.studio2_all_editions_publication_version_trigger();

-- Browser creation, deletion and edition-level visibility mutation are now owned
-- by governed commands. Service-role compatibility remains available to trusted
-- server migration/sync jobs. Permanent browser deletion is deliberately retired.
create or replace function private.studio2_guard_all_editions_browser_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $guard$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if coalesce(current_setting('studio2.all_editions_authority_write', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Edition creation must use the governed V3 edition command'
      using errcode = '42501';
  elsif tg_op = 'DELETE' then
    raise exception 'Permanent browser edition deletion is retired. Use canonical archive/retirement.'
      using errcode = '42501';
  elsif old.published is distinct from new.published then
    raise exception 'Edition visibility must use the governed V3 edition command'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function private.studio2_guard_all_editions_browser_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_all_editions_insert_delete on public.editions;
create trigger studio2_guard_all_editions_insert_delete
before insert or delete on public.editions
for each row execute function private.studio2_guard_all_editions_browser_write();

drop trigger if exists studio2_guard_all_editions_visibility on public.editions;
create trigger studio2_guard_all_editions_visibility
before update of published on public.editions
for each row execute function private.studio2_guard_all_editions_browser_write();

create or replace function public.studio2_edition_create_draft_preview(
  p_edition_number integer,
  p_name text,
  p_year integer default null,
  p_host_city text default null,
  p_host_country_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_name text;
  v_slug text;
  v_collision public.editions%rowtype;
  v_host_exists boolean := true;
  v_blockers jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.studio2_access_allowed('edition.manage', null, false) then
    raise exception 'Global edition management capability required' using errcode = '42501';
  end if;
  if p_edition_number is null or p_edition_number < 1 then
    raise exception 'Edition number must be 1 or higher' using errcode = '22023';
  end if;
  if p_year is not null and (p_year < 1900 or p_year > 2200) then
    raise exception 'Edition year is outside the supported range' using errcode = '22023';
  end if;

  v_slug := 'ssc-' || p_edition_number::text;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_name := coalesce(v_name, 'Solaris Song Contest ' || p_edition_number::text);

  select * into v_collision
  from public.editions edition
  where edition.edition_number = p_edition_number
     or edition.slug = v_slug
  order by edition.created_at
  limit 1;

  if p_host_country_id is not null then
    select exists(select 1 from public.countries country where country.id = p_host_country_id)
    into v_host_exists;
  end if;

  if v_collision.id is not null then
    v_blockers := v_blockers || jsonb_build_array(
      format('Edition %s already exists as %s.', p_edition_number, v_collision.name)
    );
  end if;
  if not v_host_exists then
    v_blockers := v_blockers || jsonb_build_array('The selected host country no longer exists.');
  end if;
  if not coalesce(private.studio2_platform_mutation_allowed('edition.create_draft'), false) then
    v_blockers := v_blockers || jsonb_build_array('The current platform mode does not allow edition creation.');
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionNumber', p_edition_number,
    'name', v_name,
    'slug', v_slug,
    'year', p_year,
    'hostCity', nullif(btrim(coalesce(p_host_city, '')), ''),
    'hostCountryId', p_host_country_id,
    'riskClass', 'R2',
    'blockers', v_blockers,
    'canCommit', jsonb_array_length(v_blockers) = 0,
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_edition_create_draft_preview(integer, text, integer, text, uuid)
  from public, anon;
grant execute on function public.studio2_edition_create_draft_preview(integer, text, integer, text, uuid)
  to authenticated, service_role;

create or replace function public.studio2_create_edition_draft_v3(
  p_edition_number integer,
  p_name text,
  p_year integer,
  p_host_city text,
  p_host_country_id uuid,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_preview jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition public.editions%rowtype;
  v_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Operation id and idempotency key are required' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', null, false) then
    raise exception 'Global edition management capability required' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'edition.create_draft',
    'R2',
    jsonb_build_object('editionNumber', p_edition_number),
    jsonb_build_object(
      'name', nullif(btrim(coalesce(p_name, '')), ''),
      'year', p_year,
      'hostCity', nullif(btrim(coalesce(p_host_city, '')), ''),
      'hostCountryId', p_host_country_id
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2-edition-create', 0));
  v_preview := public.studio2_edition_create_draft_preview(
    p_edition_number, p_name, p_year, p_host_city, p_host_country_id
  );

  if not coalesce((v_preview ->> 'canCommit')::boolean, false) then
    raise exception '%', coalesce(v_preview -> 'blockers' ->> 0, 'Edition draft cannot be created')
      using errcode = '23514';
  end if;

  perform set_config('studio2.all_editions_authority_write', 'on', true);

  insert into public.editions (
    edition_number,
    name,
    year,
    slug,
    host_city,
    host_country_id,
    status,
    published
  ) values (
    (v_preview ->> 'editionNumber')::integer,
    v_preview ->> 'name',
    nullif(v_preview ->> 'year', '')::integer,
    v_preview ->> 'slug',
    nullif(v_preview ->> 'hostCity', ''),
    nullif(v_preview ->> 'hostCountryId', '')::uuid,
    'draft',
    false
  )
  returning * into v_edition;

  select version into v_version
  from private.studio2_all_editions_versions
  where edition_id = v_edition.id;
  v_version := coalesce(v_version, 1);

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, before_data, after_data
  ) values (
    auth.uid(),
    'edition_draft_created',
    'editions',
    v_edition.id::text,
    v_edition.id,
    null,
    jsonb_build_object(
      'editionId', v_edition.id,
      'editionNumber', v_edition.edition_number,
      'name', v_edition.name,
      'slug', v_edition.slug,
      'published', v_edition.published,
      'stateVersion', v_version
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed',
    'edition',
    v_edition.id::text,
    v_version,
    v_operation_id,
    v_edition.id,
    null,
    jsonb_build_object(
      'editionId', v_edition.id,
      'change', 'draft_created',
      'editionNumber', v_edition.edition_number,
      'slug', v_edition.slug
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', v_edition.id,
    'editionNumber', v_edition.edition_number,
    'name', v_edition.name,
    'slug', v_edition.slug,
    'published', false,
    'stateVersion', v_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_create_edition_draft_v3(
  integer, text, integer, text, uuid, uuid, text
) from public, anon;
grant execute on function public.studio2_create_edition_draft_v3(
  integer, text, integer, text, uuid, uuid, text
) to authenticated, service_role;

create or replace function public.studio2_edition_make_private_preview(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_edition public.editions%rowtype;
  v_runtime record;
  v_version bigint := 1;
  v_controls jsonb := '[]'::jsonb;
  v_active_count integer := 0;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Exact edition id is required' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false)
     or not public.studio2_access_allowed('publishing.manage', p_edition_id, false) then
    raise exception 'Edition and publication management capabilities are required'
      using errcode = '42501';
  end if;

  select * into v_edition from public.editions where id = p_edition_id;
  if v_edition.id is null then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  select runtime.state, runtime.version
  into v_runtime
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id;

  select version into v_version
  from private.studio2_all_editions_versions
  where edition_id = p_edition_id;
  v_version := coalesce(v_version, 1);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'showId', control.show_id,
      'state', control.state,
      'version', control.version,
      'scheduledFor', control.scheduled_for,
      'config', control.frozen_config
    ) order by show.sort_order, show.name, show.id
  ), '[]'::jsonb),
  count(*) filter (where control.state in ('public', 'scheduled'))::integer
  into v_controls, v_active_count
  from public.studio2_show_publication_controls control
  join public.shows show on show.id = control.show_id
  where control.edition_id = p_edition_id;

  if not coalesce(private.studio2_platform_mutation_allowed('edition.make_private'), false) then
    v_blockers := v_blockers || jsonb_build_array('The current platform mode blocks edition visibility changes.');
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'editionNumber', v_edition.edition_number,
    'name', v_edition.name,
    'slug', v_edition.slug,
    'published', v_edition.published,
    'catalogueStatus', v_edition.status,
    'runtimeState', v_runtime.state,
    'runtimeVersion', v_runtime.version,
    'stateVersion', v_version,
    'showPublicationControls', v_controls,
    'activePublicationCount', v_active_count,
    'alreadyApplied', not v_edition.published and v_active_count = 0,
    'riskClass', 'R3',
    'requiresFreshAuth', true,
    'blockers', v_blockers,
    'canCommit', jsonb_array_length(v_blockers) = 0,
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_edition_make_private_preview(uuid)
  from public, anon;
grant execute on function public.studio2_edition_make_private_preview(uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_edition_make_private_v3(
  p_edition_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_preview jsonb;
  v_edition public.editions%rowtype;
  v_control public.studio2_show_publication_controls%rowtype;
  v_child jsonb;
  v_children jsonb := '[]'::jsonb;
  v_before_version bigint;
  v_after_version bigint;
  v_hidden_count integer := 0;
  v_auth_evidence jsonb;
  v_result jsonb;
begin
  if p_edition_id is null or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Edition, expected version, operation id and idempotency key are required'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A meaningful reason is required for making an edition private'
      using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false)
     or not public.studio2_access_allowed('publishing.manage', p_edition_id, false) then
    raise exception 'Edition and publication management capabilities are required'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'edition.make_private',
    'R3',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'expectedVersion', p_expected_version,
      'reason', btrim(p_reason)
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select * into v_edition
  from public.editions
  where id = p_edition_id
  for update;
  if v_edition.id is null then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  insert into private.studio2_all_editions_versions (edition_id, version, updated_at)
  values (p_edition_id, 1, now())
  on conflict (edition_id) do nothing;

  select version into v_before_version
  from private.studio2_all_editions_versions
  where edition_id = p_edition_id
  for update;

  if v_before_version is distinct from p_expected_version then
    raise exception 'Edition visibility state changed since review. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  -- Lock the exact child publication set before re-running the authoritative preview.
  perform 1
  from public.studio2_show_publication_controls control
  where control.edition_id = p_edition_id
  order by control.show_id
  for update;

  v_preview := public.studio2_edition_make_private_preview(p_edition_id);
  if not coalesce((v_preview ->> 'canCommit')::boolean, false) then
    raise exception '%', coalesce(v_preview -> 'blockers' ->> 0, 'Edition cannot be made private')
      using errcode = '23514';
  end if;

  if coalesce((v_preview ->> 'alreadyApplied')::boolean, false) then
    v_result := jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'editionId', p_edition_id,
      'stateVersion', v_before_version,
      'hiddenShowCount', 0,
      'operationId', v_operation_id,
      'receiptId', v_operation_id
    );
    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  v_auth_evidence := private.studio2_require_fresh_auth(300);

  for v_control in
    select *
    from public.studio2_show_publication_controls control
    where control.edition_id = p_edition_id
      and control.state in ('public', 'scheduled')
    order by control.show_id
  loop
    v_child := public.studio2_apply_show_publication_change(
      v_control.show_id,
      'hidden',
      v_control.frozen_config,
      null,
      gen_random_uuid(),
      p_idempotency_key || ':hide:' || v_control.show_id::text,
      v_control.version
    );
    v_children := v_children || jsonb_build_array(jsonb_build_object(
      'showId', v_control.show_id,
      'operationId', v_child ->> 'operationId',
      'state', v_child ->> 'state',
      'version', v_child -> 'version'
    ));
    v_hidden_count := v_hidden_count + 1;
  end loop;

  perform set_config('studio2.all_editions_authority_write', 'on', true);
  update public.editions
  set published = false
  where id = p_edition_id
  returning * into v_edition;

  select version into v_after_version
  from private.studio2_all_editions_versions
  where edition_id = p_edition_id;
  v_after_version := coalesce(v_after_version, v_before_version);

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, before_data, after_data
  ) values (
    auth.uid(),
    'edition_made_private',
    'editions',
    p_edition_id::text,
    p_edition_id,
    jsonb_build_object(
      'published', true,
      'stateVersion', v_before_version,
      'activePublicationCount', v_preview -> 'activePublicationCount'
    ),
    jsonb_build_object(
      'published', false,
      'stateVersion', v_after_version,
      'hiddenShowCount', v_hidden_count,
      'childOperations', v_children,
      'reason', btrim(p_reason)
    )
  );

  update public.studio2_operation_receipts
  set actor_session_id = v_auth_evidence ->> 'sessionId',
      auth_freshness_evidence = v_auth_evidence,
      updated_at = now()
  where operation_id = v_operation_id
    and actor_id = auth.uid();

  perform private.v3_emit_domain_event(
    'edition.changed',
    'edition',
    p_edition_id::text,
    v_after_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'editionId', p_edition_id,
      'change', 'made_private',
      'hiddenShowCount', v_hidden_count,
      'reason', btrim(p_reason)
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'editionId', p_edition_id,
    'published', false,
    'hiddenShowCount', v_hidden_count,
    'childOperations', v_children,
    'previousVersion', v_before_version,
    'stateVersion', v_after_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_edition_make_private_v3(
  uuid, bigint, uuid, text, text
) from public, anon;
grant execute on function public.studio2_apply_edition_make_private_v3(
  uuid, bigint, uuid, text, text
) to authenticated, service_role;

comment on function public.studio2_create_edition_draft_v3(integer, text, integer, text, uuid, uuid, text) is
  'Canonical Organizer All Editions draft creation command. Global edition.manage, S2 idempotency/receipt, serialized uniqueness and canonical audit/event evidence.';
comment on function public.studio2_edition_make_private_preview(uuid) is
  'Exact-edition R3 preflight for cross-domain make-private. Includes the complete canonical show-publication child set and one aggregate CAS version.';
comment on function public.studio2_apply_edition_make_private_v3(uuid, bigint, uuid, text, text) is
  'Atomic R3 make-private command. Reuses governed show-publication transitions inside one transaction, then updates edition visibility and returns one parent receipt.';

notify pgrst, 'reload schema';

commit;

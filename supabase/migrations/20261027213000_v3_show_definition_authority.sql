begin;

select public.v3_register_migration_contract(
  'v3.show.definition-authority', 1, 'forward_fix_only', false, null,
  'Govern show definition CRUD with actor scope, operation replay, CAS and transactional audit; retain Results ownership and verify clean replay and current-main upgrade.'
);

-- V3 show-definition authority. Show identity/configuration is separate from
-- live runtime, lineup, publication, hosting, voting and Results. These commands
-- replace the direct Organizer CRUD writer without becoming a second authority
-- over those neighbouring domains.

create or replace function private.v3_require_show_definition_manager(p_edition_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $auth$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id)
     and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  return v_actor;
end
$auth$;

revoke all on function private.v3_require_show_definition_manager(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.v3_create_show(
  p_edition_id uuid,
  p_name text,
  p_kind text,
  p_sort_order integer,
  p_publication_config jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_claim jsonb;
  v_show public.shows%rowtype;
  v_result jsonb;
  v_version bigint;
begin
  if p_edition_id is null or length(v_name) not between 1 and 160
     or p_kind not in ('heat','semi-final','second-chance','grand-final','special','other')
     or p_sort_order is null or p_sort_order < 1
     or jsonb_typeof(coalesce(p_publication_config, '{}'::jsonb)) <> 'object'
     or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;
  v_actor := private.v3_require_show_definition_manager(p_edition_id);

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'show.create', 'R2',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'name', v_name,
      'kind', p_kind,
      'sortOrder', p_sort_order,
      'publicationConfig', coalesce(p_publication_config, '{}'::jsonb),
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  insert into public.shows (
    edition_id, name, kind, sort_order, published, publication_config
  ) values (
    p_edition_id, v_name, p_kind, p_sort_order, false,
    coalesce(p_publication_config, '{}'::jsonb)
  ) returning * into v_show;

  v_version := txid_current();
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'show', jsonb_build_object(
      'id', v_show.id,
      'editionId', v_show.edition_id,
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order
    )
  );

  -- show_id remains null intentionally so setup-only shows can still be deleted
  -- without deleting immutable audit history. aggregate_id keeps the durable id.
  perform private.v3_emit_domain_event(
    'show.changed', 'show_definition', v_show.id::text, v_version,
    p_operation_id, v_show.edition_id, null,
    jsonb_build_object(
      'changeKind', 'show_created',
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

create or replace function public.v3_update_show_definition(
  p_show_id uuid,
  p_expected_name text,
  p_expected_kind text,
  p_expected_sort_order integer,
  p_name text,
  p_kind text,
  p_sort_order integer,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if p_show_id is null or length(v_name) not between 1 and 160
     or p_kind not in ('heat','semi-final','second-chance','grand-final','special','other')
     or p_sort_order is null or p_sort_order < 1 or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null then raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND'; end if;
  v_actor := private.v3_require_show_definition_manager(v_show.edition_id);

  if v_show.name is distinct from p_expected_name
     or v_show.kind is distinct from p_expected_kind
     or v_show.sort_order is distinct from p_expected_sort_order then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'show.definition.update', 'R2',
    jsonb_build_object('editionId', v_show.edition_id, 'showId', v_show.id),
    jsonb_build_object(
      'expectedName', p_expected_name,
      'expectedKind', p_expected_kind,
      'expectedSortOrder', p_expected_sort_order,
      'name', v_name,
      'kind', p_kind,
      'sortOrder', p_sort_order,
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  update public.shows
  set name = v_name, kind = p_kind, sort_order = p_sort_order
  where id = v_show.id
  returning * into v_show;

  v_version := txid_current();
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'show', jsonb_build_object(
      'id', v_show.id,
      'editionId', v_show.edition_id,
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order
    )
  );
  perform private.v3_emit_domain_event(
    'show.changed', 'show_definition', v_show.id::text, v_version,
    p_operation_id, v_show.edition_id, null,
    jsonb_build_object(
      'changeKind', 'show_definition_updated',
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

create or replace function public.v3_delete_show(
  p_show_id uuid,
  p_expected_name text,
  p_expected_kind text,
  p_expected_sort_order integer,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if p_show_id is null or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null then raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND'; end if;
  v_actor := private.v3_require_show_definition_manager(v_show.edition_id);

  if v_show.name is distinct from p_expected_name
     or v_show.kind is distinct from p_expected_kind
     or v_show.sort_order is distinct from p_expected_sort_order then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  -- Deletion is setup cleanup, never a way to erase official/history-bearing
  -- state. Once a show is public, has participants/results/votes, has a runtime
  -- event, or has publication execution history, it must be retained.
  if v_show.published
     or exists (select 1 from public.participants where show_id = v_show.id)
     or exists (select 1 from public.results where show_id = v_show.id)
     or exists (select 1 from public.jury_votes where show_id = v_show.id)
     or exists (select 1 from public.televote_votes where show_id = v_show.id)
     or exists (select 1 from public.studio2_show_publication_executions where show_id = v_show.id)
     or exists (select 1 from private.v3_domain_events where show_id = v_show.id) then
    raise exception using
      errcode = '55000',
      message = 'SHOW_HAS_DURABLE_HISTORY',
      hint = 'Retain the show and use its lifecycle/publication controls instead of deleting official history.';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'show.delete', 'R3',
    jsonb_build_object('editionId', v_show.edition_id, 'showId', v_show.id),
    jsonb_build_object(
      'expectedName', p_expected_name,
      'expectedKind', p_expected_kind,
      'expectedSortOrder', p_expected_sort_order,
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  v_version := txid_current();
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'showId', v_show.id,
    'editionId', v_show.edition_id,
    'deleted', true
  );

  delete from public.shows where id = v_show.id;

  perform private.v3_emit_domain_event(
    'show.changed', 'show_definition', v_show.id::text, v_version,
    p_operation_id, v_show.edition_id, null,
    jsonb_build_object(
      'changeKind', 'show_deleted',
      'name', v_show.name,
      'kind', v_show.kind,
      'sortOrder', v_show.sort_order,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

revoke all on function public.v3_create_show(uuid,text,text,integer,jsonb,text,uuid,text)
  from public, anon, service_role;
revoke all on function public.v3_update_show_definition(uuid,text,text,integer,text,text,integer,text,uuid,text)
  from public, anon, service_role;
revoke all on function public.v3_delete_show(uuid,text,text,integer,text,uuid,text)
  from public, anon, service_role;

grant execute on function public.v3_create_show(uuid,text,text,integer,jsonb,text,uuid,text) to authenticated;
grant execute on function public.v3_update_show_definition(uuid,text,text,integer,text,text,integer,text,uuid,text) to authenticated;
grant execute on function public.v3_delete_show(uuid,text,text,integer,text,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;

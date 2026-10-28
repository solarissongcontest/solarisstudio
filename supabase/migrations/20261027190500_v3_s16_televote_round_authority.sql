begin;

select public.v3_register_migration_contract(
  'v3.televote.round-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 consolidates Televote round CRUD under scoped, versioned canonical commands'
);

-- S16 canonical mutation authority: Televote round configuration must not be
-- mutated by application-side table DML. These commands reuse the canonical
-- Solaris permission engine, operation ledger and the existing round revision
-- counter so retries and stale Organizer writes are deterministic.

create or replace function televoting.v3_create_round(
  p_remote_edition_id uuid,
  p_name text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $create_round$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_solaris_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_round televoting.rounds%rowtype;
  v_round_version bigint := 0;
  v_result jsonb;
begin
  if p_remote_edition_id is null or v_name is null or length(v_name) > 160 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select link.solaris_id
  into v_solaris_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = p_remote_edition_id::text
  limit 1;

  if v_solaris_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.round.create',
    'R2',
    jsonb_build_object(
      'editionId', v_solaris_edition_id,
      'remoteEditionId', p_remote_edition_id
    ),
    jsonb_build_object('name', v_name)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'operationId', v_operation_id);
  end if;

  perform 1
  from televoting.editions edition
  where edition.id = p_remote_edition_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  insert into televoting.rounds (edition_id, name, status)
  values (p_remote_edition_id, v_name, 'draft')
  returning * into v_round;

  insert into public.televoting_round_bindings (
    remote_round_id,
    remote_edition_id,
    edition_id,
    show_id,
    source_mode,
    last_synced_at,
    frozen_at,
    updated_at
  )
  values (
    v_round.id::text,
    p_remote_edition_id::text,
    v_solaris_edition_id,
    null,
    'edition',
    null,
    null,
    now()
  )
  on conflict (remote_round_id) do update
  set remote_edition_id = excluded.remote_edition_id,
      edition_id = excluded.edition_id,
      show_id = null,
      source_mode = 'edition',
      frozen_at = null,
      updated_at = excluded.updated_at;

  select coalesce(version, 0)
  into v_round_version
  from public.studio2_televote_round_versions
  where round_id = v_round.id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    action,
    target_type,
    target_id,
    new_values
  ) values (
    auth.uid(),
    'create_round',
    'round',
    v_round.id::text,
    jsonb_build_object(
      'name', v_round.name,
      'remote_edition_id', p_remote_edition_id,
      'solaris_edition_id', v_solaris_edition_id,
      'canonical_authority', 'televoting.v3_create_round'
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'id', v_round.id,
    'name', v_round.name,
    'status', v_round.status,
    'roundVersion', v_round_version,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$create_round$;

create or replace function televoting.v3_rename_round(
  p_round_id uuid,
  p_name text,
  p_expected_round_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $rename_round$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_solaris_edition_id uuid;
  v_current_version bigint := 0;
  v_claim jsonb;
  v_operation_id uuid;
  v_round televoting.rounds%rowtype;
  v_result jsonb;
begin
  if p_round_id is null or v_name is null or length(v_name) > 160
     or p_expected_round_version is null or p_expected_round_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select binding.edition_id
  into v_solaris_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;
  if v_solaris_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.round.rename',
    'R1',
    jsonb_build_object('editionId', v_solaris_edition_id, 'roundId', p_round_id),
    jsonb_build_object('name', v_name, 'expectedRoundVersion', p_expected_round_version)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'operationId', v_operation_id);
  end if;

  select * into v_round
  from televoting.rounds
  where id = p_round_id
  for update;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select coalesce(version, 0)
  into v_current_version
  from public.studio2_televote_round_versions
  where round_id = p_round_id
  for update;
  if v_current_version is distinct from p_expected_round_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  update televoting.rounds
  set name = v_name
  where id = p_round_id;

  select coalesce(version, 0)
  into v_current_version
  from public.studio2_televote_round_versions
  where round_id = p_round_id;

  insert into televoting.admin_audit_log (
    actor_admin_id, action, target_type, target_id, old_values, new_values
  ) values (
    auth.uid(), 'rename_round', 'round', p_round_id::text,
    jsonb_build_object('name', v_round.name),
    jsonb_build_object('name', v_name, 'canonical_authority', 'televoting.v3_rename_round')
  );

  v_result := jsonb_build_object(
    'ok', true,
    'id', p_round_id,
    'name', v_name,
    'roundVersion', v_current_version,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$rename_round$;

create or replace function televoting.v3_delete_draft_round(
  p_round_id uuid,
  p_expected_round_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $delete_round$
declare
  v_solaris_edition_id uuid;
  v_current_version bigint := 0;
  v_claim jsonb;
  v_operation_id uuid;
  v_round televoting.rounds%rowtype;
  v_result jsonb;
begin
  if p_round_id is null or p_expected_round_version is null or p_expected_round_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select binding.edition_id
  into v_solaris_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;
  if v_solaris_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.round.delete',
    'R2',
    jsonb_build_object('editionId', v_solaris_edition_id, 'roundId', p_round_id),
    jsonb_build_object('expectedRoundVersion', p_expected_round_version)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'operationId', v_operation_id);
  end if;

  select * into v_round
  from televoting.rounds
  where id = p_round_id
  for update;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if v_round.status <> 'draft' then
    raise exception using errcode = '25000', message = 'STATE_CHANGED';
  end if;

  select coalesce(version, 0)
  into v_current_version
  from public.studio2_televote_round_versions
  where round_id = p_round_id
  for update;
  if v_current_version is distinct from p_expected_round_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  insert into televoting.admin_audit_log (
    actor_admin_id, action, target_type, target_id, old_values, new_values
  ) values (
    auth.uid(), 'delete_round', 'round', p_round_id::text,
    jsonb_build_object('name', v_round.name, 'status', v_round.status),
    jsonb_build_object('canonical_authority', 'televoting.v3_delete_draft_round')
  );

  delete from public.televoting_round_bindings
  where remote_round_id = p_round_id::text;
  delete from televoting.rounds
  where id = p_round_id;

  v_result := jsonb_build_object(
    'ok', true,
    'id', p_round_id,
    'deleted', true,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$delete_round$;

revoke all on function televoting.v3_create_round(uuid, text, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function televoting.v3_create_round(uuid, text, uuid, text, uuid)
  to authenticated;
revoke all on function televoting.v3_rename_round(uuid, text, bigint, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function televoting.v3_rename_round(uuid, text, bigint, uuid, text, uuid)
  to authenticated;
revoke all on function televoting.v3_delete_draft_round(uuid, bigint, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function televoting.v3_delete_draft_round(uuid, bigint, uuid, text, uuid)
  to authenticated;

-- The Organizer overview now exposes the same round CAS revision used by
-- canonical mutation commands. It remains a read-only voting.read projection.
create or replace function televoting.admin_rounds_page_overview(
  p_solaris_edition_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $overview$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not public.studio2_access_allowed('voting.read', p_solaris_edition_id, false) then
    raise exception 'Voting operations read capability required' using errcode = '42501';
  end if;

  with selected as (
    select e.id as solaris_id, e.name as solaris_name, e.edition_number
    from public.editions e
    where e.id = p_solaris_edition_id
    limit 1
  ),
  remote as (
    select
      s.solaris_id,
      s.solaris_name,
      s.edition_number,
      te.id as remote_id,
      te.is_active,
      te.is_archived
    from selected s
    left join public.integration_links il
      on il.service = 'televoting'
     and il.entity_type = 'edition'
     and il.solaris_id = s.solaris_id
    left join televoting.editions te
      on te.id::text = il.remote_id
    limit 1
  ),
  round_rows as (
    select
      r.id,
      r.edition_id,
      r.name,
      r.status,
      r.opened_at,
      r.closed_at,
      r.participant_mode,
      r.self_voting_mode,
      r.created_at,
      coalesce(rv.version, 0) as version,
      count(re.id)::int as entry_count
    from remote rm
    join televoting.rounds r on r.edition_id = rm.remote_id
    left join public.studio2_televote_round_versions rv on rv.round_id = r.id
    left join televoting.round_entries re on re.round_id = r.id
    group by r.id, rv.version
  )
  select jsonb_build_object(
    'linked', coalesce((select remote_id is not null from remote), false),
    'edition', (
      select case
        when remote_id is null then null
        else jsonb_build_object(
          'id', remote_id,
          'solaris_id', solaris_id,
          'name', solaris_name,
          'edition_number', edition_number,
          'is_active', is_active,
          'is_archived', is_archived
        )
      end
      from remote
    ),
    'rounds', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'edition_id', edition_id,
          'name', name,
          'status', status,
          'opened_at', opened_at,
          'closed_at', closed_at,
          'participant_mode', participant_mode,
          'self_voting_mode', self_voting_mode,
          'version', version,
          'entry_count', entry_count
        ) order by created_at
      ) from round_rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end
$overview$;

revoke execute on function televoting.admin_rounds_page_overview(uuid)
  from public, anon, service_role;
grant execute on function televoting.admin_rounds_page_overview(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;

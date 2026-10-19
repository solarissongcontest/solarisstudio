begin;

-- #598 follow-up on top of the canonical v3_show_lineup_* authority.
-- Keep shows + participants as canonical truth and reuse the established opaque
-- state version plus the already-declared show.changed / edition.changed facts.
select public.v3_register_migration_contract(
  'v3.show-lineup-member-entity-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Extend governed line-up authority to add/remove membership and custom edition identity maintenance without introducing a second state/event vocabulary.'
);

create or replace function private.v3_lock_show_lineup_expected(
  p_show_id uuid,
  p_expected_state_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_state jsonb;
  v_version text;
begin
  if p_show_id is null or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform 1
  from public.shows s
  where s.id = p_show_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  perform 1
  from public.participants p
  where p.show_id = p_show_id
  order by p.id
  for update;

  v_state := private.v3_show_lineup_state_payload(p_show_id);
  v_version := private.v3_show_lineup_state_version(p_show_id);
  if v_version is distinct from p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_version
      )::text;
  end if;

  return v_state || jsonb_build_object('stateVersion', v_version);
end
$fn$;

revoke all on function private.v3_lock_show_lineup_expected(uuid, text)
  from public, anon, authenticated;

create or replace function private.v3_emit_lineup_changed(
  p_operation_id uuid,
  p_edition_id uuid,
  p_show_id uuid,
  p_change_kind text,
  p_before_version text,
  p_after_version text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_event_version bigint;
begin
  v_event_version := hashtextextended(coalesce(p_after_version, ''), 0)
    & 9223372036854775807::bigint;

  return private.v3_emit_domain_event(
    'show.changed',
    'show',
    p_show_id::text,
    v_event_version,
    p_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'changeKind', p_change_kind,
      'beforeStateVersion', p_before_version,
      'afterStateVersion', p_after_version
    ) || coalesce(p_payload, '{}'::jsonb),
    1,
    array[]::text[]
  );
end
$fn$;

revoke all on function private.v3_emit_lineup_changed(uuid, uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function private.v3_show_lineup_member_dependencies(
  p_show_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_entity_id uuid;
  v_country_id uuid;
  v_results integer := 0;
  v_jury_received integer := 0;
  v_jury_voter integer := 0;
  v_jury_status integer := 0;
  v_jury_submission integer := 0;
  v_televote integer := 0;
  v_voters integer := 0;
  v_total integer := 0;
begin
  select p.contest_entity_id, p.country_id
  into v_entity_id, v_country_id
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND';
  end if;

  select count(*)::integer into v_results
  from public.results r
  where r.show_id = p_show_id
    and ((v_entity_id is not null and r.contest_entity_id = v_entity_id)
      or (v_country_id is not null and r.country_id = v_country_id));

  select count(*)::integer into v_jury_received
  from public.jury_votes j
  where j.show_id = p_show_id
    and ((v_entity_id is not null and j.receiving_entity_id = v_entity_id)
      or (v_country_id is not null and j.receiving_country_id = v_country_id));

  select count(*)::integer into v_jury_voter
  from public.jury_votes j
  where j.show_id = p_show_id
    and ((v_entity_id is not null and j.voter_entity_id = v_entity_id)
      or (v_country_id is not null and j.voter_country_id = v_country_id));

  select count(*)::integer into v_jury_status
  from public.jury_ballot_statuses s
  where s.show_id = p_show_id
    and ((v_entity_id is not null and s.voter_entity_id = v_entity_id)
      or (v_country_id is not null and s.voter_country_id = v_country_id));

  select count(*)::integer into v_jury_submission
  from public.jury_ballot_submissions s
  where s.show_id = p_show_id
    and ((v_entity_id is not null and s.voter_entity_id = v_entity_id)
      or (v_country_id is not null and s.voter_country_id = v_country_id));

  select count(*)::integer into v_televote
  from public.televote_votes t
  where t.show_id = p_show_id
    and ((v_entity_id is not null and t.contest_entity_id = v_entity_id)
      or (v_country_id is not null and t.country_id = v_country_id));

  select count(*)::integer into v_voters
  from public.voters v
  where v.show_id = p_show_id
    and ((v_entity_id is not null and v.contest_entity_id = v_entity_id)
      or (v_country_id is not null and v.country_id = v_country_id));

  v_total := v_results + v_jury_received + v_jury_voter + v_jury_status
    + v_jury_submission + v_televote + v_voters;

  return jsonb_build_object(
    'participantId', p_participant_id,
    'contestEntityId', v_entity_id,
    'countryId', v_country_id,
    'results', v_results,
    'juryReceivedVotes', v_jury_received,
    'juryVoterVotes', v_jury_voter,
    'juryBallotStatuses', v_jury_status,
    'juryBallotSubmissions', v_jury_submission,
    'televoteVotes', v_televote,
    'voterRecords', v_voters,
    'total', v_total,
    'canRemove', v_total = 0
  );
end
$fn$;

revoke all on function private.v3_show_lineup_member_dependencies(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_show_lineup_member_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_dependencies jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_dependencies := private.v3_show_lineup_member_dependencies(p_show_id, p_participant_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'participantId', p_participant_id,
    'stateVersion', private.v3_show_lineup_state_version(p_show_id),
    'dependencies', v_dependencies,
    'canRemove', coalesce((v_dependencies ->> 'canRemove')::boolean, false),
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_show_lineup_member_preflight(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.v3_show_lineup_member_preflight(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.v3_execute_show_lineup_member_operation(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_entity public.contest_entities%rowtype;
  v_country public.countries%rowtype;
  v_country_id uuid;
  v_entity_id uuid;
  v_participant_id uuid;
  v_prior record;
  v_dependencies jsonb;
  v_result jsonb;
  v_added integer := 0;
  v_removed integer := 0;
  v_created_entity boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
     or v_action not in ('add_member', 'create_custom_member', 'remove_member') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_action = 'remove_member' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.' || replace(v_action, '_', '.'),
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'expectedStateVersion', p_expected_state_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  v_before := private.v3_lock_show_lineup_expected(p_show_id, p_expected_state_version);
  v_before_version := v_before ->> 'stateVersion';

  if v_action = 'add_member' then
    v_country_id := nullif(v_payload ->> 'countryId', '')::uuid;
    v_entity_id := nullif(v_payload ->> 'contestEntityId', '')::uuid;
    if (v_country_id is null) = (v_entity_id is null) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if v_country_id is not null then
      select * into v_country from public.countries where id = v_country_id;
      if v_country.id is null then
        raise exception using errcode = 'P0002', message = 'COUNTRY_NOT_FOUND';
      end if;

      select * into v_entity
      from public.contest_entities e
      where e.edition_id = p_edition_id and e.country_id = v_country_id;

      if v_entity.id is null then
        insert into public.contest_entities(
          edition_id, entity_type, country_id, display_name, abbreviation,
          flag_image, region
        ) values (
          p_edition_id, 'global', v_country_id, v_country.name,
          v_country.short_code, v_country.flag_image, v_country.region
        ) returning * into v_entity;
        v_created_entity := true;
      end if;
      v_entity_id := v_entity.id;
    else
      select * into v_entity
      from public.contest_entities e
      where e.id = v_entity_id and e.edition_id = p_edition_id;
      if v_entity.id is null then
        raise exception using errcode = 'P0002', message = 'CONTEST_ENTITY_NOT_FOUND';
      end if;
      v_country_id := v_entity.country_id;
    end if;

    if exists (
      select 1 from public.participants p
      where p.show_id = p_show_id
        and (p.contest_entity_id = v_entity_id
          or (v_country_id is not null and p.country_id = v_country_id))
    ) then
      raise exception using errcode = '23505', message = 'MEMBER_ALREADY_EXISTS';
    end if;

    select p.artist, p.song into v_prior
    from public.participants p
    where p.edition_id = p_edition_id
      and p.show_id is distinct from p_show_id
      and (p.contest_entity_id = v_entity_id
        or (v_country_id is not null and p.country_id = v_country_id))
      and (p.artist is not null or p.song is not null)
    order by p.updated_at desc, p.id desc
    limit 1;

    insert into public.participants(
      edition_id, show_id, country_id, contest_entity_id,
      running_order, running_order_allocation, semi_final, artist, song
    ) values (
      p_edition_id, p_show_id, v_country_id, v_entity_id,
      null, null, v_show.kind, v_prior.artist, v_prior.song
    ) returning id into v_participant_id;
    v_added := 1;

  elsif v_action = 'create_custom_member' then
    if nullif(btrim(coalesce(v_payload ->> 'displayName', '')), '') is null
       or nullif(btrim(coalesce(v_payload ->> 'abbreviation', '')), '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    insert into public.contest_entities(
      edition_id, entity_type, country_id, display_name, abbreviation,
      flag_image, region
    ) values (
      p_edition_id,
      'custom',
      null,
      btrim(v_payload ->> 'displayName'),
      btrim(v_payload ->> 'abbreviation'),
      nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), ''),
      nullif(btrim(coalesce(v_payload ->> 'region', '')), '')
    ) returning * into v_entity;
    v_entity_id := v_entity.id;
    v_created_entity := true;

    insert into public.participants(
      edition_id, show_id, country_id, contest_entity_id,
      running_order, running_order_allocation, semi_final, artist, song
    ) values (
      p_edition_id, p_show_id, null, v_entity_id,
      null, null, v_show.kind, null, null
    ) returning id into v_participant_id;
    v_added := 1;

  else
    v_participant_id := nullif(v_payload ->> 'participantId', '')::uuid;
    if v_participant_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select p.contest_entity_id, p.country_id
    into v_entity_id, v_country_id
    from public.participants p
    where p.id = v_participant_id
      and p.show_id = p_show_id
      and p.edition_id = p_edition_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND';
    end if;

    v_dependencies := private.v3_show_lineup_member_dependencies(p_show_id, v_participant_id);
    if not coalesce((v_dependencies ->> 'canRemove')::boolean, false) then
      raise exception using
        errcode = '23503',
        message = 'DEPENDENCY_FAILURE',
        detail = v_dependencies::text;
    end if;

    delete from public.participants p
    where p.id = v_participant_id and p.show_id = p_show_id;
    v_removed := 1;
  end if;

  v_after := private.v3_show_lineup_state_payload(p_show_id);
  v_after_version := private.v3_show_lineup_state_version(p_show_id);
  perform private.v3_emit_lineup_changed(
    v_operation_id,
    p_edition_id,
    p_show_id,
    v_action,
    v_before_version,
    v_after_version,
    jsonb_build_object(
      'participantId', v_participant_id,
      'contestEntityId', v_entity_id,
      'countryId', v_country_id,
      'added', v_added,
      'removed', v_removed,
      'createdContestEntity', v_created_entity,
      'reason', v_reason,
      'dependencies', coalesce(v_dependencies, '{}'::jsonb)
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'lineupStage', v_show.lineup_stage,
    'stateVersion', v_after_version,
    'participantCount', jsonb_array_length(v_after -> 'participants'),
    'participantId', v_participant_id,
    'contestEntityId', v_entity_id,
    'added', v_added,
    'removed', v_removed,
    'changed', true
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_show_lineup_member_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_lineup_member_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function private.v3_contest_entity_dependency_summary(p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_ref record;
  v_count bigint;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  for v_ref in
    select ns.nspname as schema_name, cls.relname as table_name,
           att.attname as column_name, con.conname as constraint_name,
           con.confdeltype as delete_action
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class cls on cls.oid = con.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
    join pg_catalog.pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.contest_entities'::regclass
      and array_length(con.conkey, 1) = 1
      and array_length(con.confkey, 1) = 1
    order by ns.nspname, cls.relname, con.conname
  loop
    execute format('select count(*)::bigint from %I.%I where %I = $1',
      v_ref.schema_name, v_ref.table_name, v_ref.column_name)
      into v_count using p_entity_id;
    v_total := v_total + coalesce(v_count, 0);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'schema', v_ref.schema_name,
      'table', v_ref.table_name,
      'column', v_ref.column_name,
      'constraint', v_ref.constraint_name,
      'deleteAction', case v_ref.delete_action
        when 'a' then 'no_action' when 'r' then 'restrict'
        when 'c' then 'cascade' when 'n' then 'set_null'
        when 'd' then 'set_default' else 'unknown' end,
      'count', coalesce(v_count, 0)
    ));
  end loop;

  return jsonb_build_object(
    'contestEntityId', p_entity_id,
    'totalReferences', v_total,
    'canDelete', v_total = 0,
    'references', v_items
  );
end
$fn$;

revoke all on function private.v3_contest_entity_dependency_summary(uuid)
  from public, anon, authenticated;

create or replace function public.v3_custom_contest_entity_preflight(
  p_edition_id uuid,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_entity public.contest_entities%rowtype;
  v_dependencies jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  select * into v_entity
  from public.contest_entities e
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
    and e.entity_type = 'custom';
  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOM_ENTITY_NOT_FOUND';
  end if;

  v_dependencies := private.v3_contest_entity_dependency_summary(p_entity_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'entityId', p_entity_id,
    'displayName', v_entity.display_name,
    'abbreviation', v_entity.abbreviation,
    'flagImage', v_entity.flag_image,
    'region', v_entity.region,
    'updatedAt', v_entity.updated_at,
    'dependencies', v_dependencies,
    'canDelete', coalesce((v_dependencies ->> 'canDelete')::boolean, false),
    'deleteRiskClass', 'R3',
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_custom_contest_entity_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.v3_custom_contest_entity_preflight(uuid, uuid)
  to authenticated, service_role;

create or replace function public.v3_execute_custom_contest_entity_operation(
  p_edition_id uuid,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_entity public.contest_entities%rowtype;
  v_after public.contest_entities%rowtype;
  v_dependencies jsonb;
  v_auth_evidence jsonb;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_entity_id is null or p_operation_id is null
     or p_expected_updated_at is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object'
     or v_action not in ('update', 'delete') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_action = 'delete' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;
  if v_action = 'delete' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'contest.entity.custom.' || v_action,
    case when v_action = 'delete' then 'R3' else 'R2' end,
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'contest_entity',
      'subjectId', p_entity_id
    ),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'expectedUpdatedAt', p_expected_updated_at,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select * into v_entity
  from public.contest_entities e
  where e.id = p_entity_id
    and e.edition_id = p_edition_id
    and e.entity_type = 'custom'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CUSTOM_ENTITY_NOT_FOUND';
  end if;
  if v_entity.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001', message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedUpdatedAt', p_expected_updated_at,
        'currentUpdatedAt', v_entity.updated_at
      )::text;
  end if;

  if v_action = 'update' then
    if nullif(btrim(coalesce(v_payload ->> 'displayName', '')), '') is null
       or nullif(btrim(coalesce(v_payload ->> 'abbreviation', '')), '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    update public.contest_entities e
    set display_name = btrim(v_payload ->> 'displayName'),
        abbreviation = btrim(v_payload ->> 'abbreviation'),
        flag_image = nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), ''),
        region = nullif(btrim(coalesce(v_payload ->> 'region', '')), ''),
        updated_at = now()
    where e.id = p_entity_id
    returning * into v_after;
  else
    v_dependencies := private.v3_contest_entity_dependency_summary(p_entity_id);
    if not coalesce((v_dependencies ->> 'canDelete')::boolean, false) then
      raise exception using errcode = '23503', message = 'DEPENDENCY_FAILURE',
        detail = v_dependencies::text;
    end if;
    delete from public.contest_entities e
    where e.id = p_entity_id and e.edition_id = p_edition_id and e.entity_type = 'custom';
  end if;

  v_event_version := hashtextextended(
    coalesce(case when v_action = 'update' then v_after.updated_at else v_entity.updated_at end::text, ''),
    0
  ) & 9223372036854775807::bigint;
  perform private.v3_emit_domain_event(
    'edition.changed',
    'edition',
    p_edition_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'changeKind', 'custom_contest_entity_' || v_action,
      'contestEntityId', p_entity_id,
      'reason', v_reason,
      'dependencies', coalesce(v_dependencies, '{}'::jsonb),
      'freshAuth', coalesce(v_auth_evidence, '{}'::jsonb)
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'contestEntityId', p_entity_id,
    'action', v_action,
    'updatedAt', case when v_action = 'update' then to_jsonb(v_after.updated_at) else 'null'::jsonb end,
    'deleted', v_action = 'delete'
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_custom_contest_entity_operation(
  uuid, uuid, text, jsonb, uuid, text, timestamptz, text, uuid
) from public, anon;
grant execute on function public.v3_execute_custom_contest_entity_operation(
  uuid, uuid, text, jsonb, uuid, text, timestamptz, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

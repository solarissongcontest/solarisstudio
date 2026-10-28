begin;

select public.v3_register_migration_contract(
  '20261027204000_v3_s16_televote_solaris_sync_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 makes Solaris-to-Televote lineup/binding synchronization one scoped atomic operation without writing Results-owned binding freeze state'
);

create or replace function televoting.v3_sync_round_lineup(
  p_round_id uuid,
  p_source_mode text,
  p_show_id uuid,
  p_countries jsonb,
  p_expected_round_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $sync$
declare
  v_source_mode text := lower(btrim(coalesce(p_source_mode, '')));
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_item jsonb;
  v_code text;
  v_name text;
  v_flag_url text;
  v_subtitle text;
  v_codes text[] := array[]::text[];
  v_rows jsonb := '[]'::jsonb;
  v_custom_count integer := 0;
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_round_id is null
     or v_source_mode not in ('edition', 'show')
     or (v_source_mode = 'edition' and p_show_id is not null)
     or (v_source_mode = 'show' and p_show_id is null)
     or p_expected_round_version is null or p_expected_round_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(p_countries) <> 'array'
     or jsonb_array_length(p_countries) not between 2 and 50 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select binding.edition_id into v_solaris_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  if v_solaris_edition_id is null then
    select link.solaris_id into v_solaris_edition_id
    from public.integration_links link
    where link.service = 'televoting'
      and link.entity_type = 'edition'
      and link.remote_id = v_round.edition_id::text
    limit 1;
  end if;

  if v_solaris_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_source_mode = 'show' and not exists (
    select 1 from public.shows show_row
    where show_row.id = p_show_id
      and show_row.edition_id = v_solaris_edition_id
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SHOW_SCOPE';
  end if;

  for v_item in select value from jsonb_array_elements(p_countries) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_code := nullif(btrim(coalesce(v_item ->> 'code', '')), '');
    v_name := nullif(btrim(coalesce(v_item ->> 'name', '')), '');
    v_flag_url := nullif(btrim(coalesce(v_item ->> 'flagUrl', '')), '');
    v_subtitle := coalesce(nullif(btrim(coalesce(v_item ->> 'subtitle', '')), ''), 'Official entry pending');
    if v_code is null or length(v_code) > 24
       or v_name is null or length(v_name) > 160
       or length(coalesce(v_flag_url, '')) > 1000
       or length(v_subtitle) > 240
       or v_code = any(v_codes) then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_codes := v_codes || v_code;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'code', v_code,
      'name', v_name,
      'flagUrl', v_flag_url,
      'subtitle', v_subtitle,
      'displayOrder', array_length(v_codes, 1)
    ));
  end loop;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.round.sync_solaris_lineup',
    'R2',
    jsonb_build_object(
      'editionId', v_solaris_edition_id,
      'showId', p_show_id,
      'roundId', p_round_id
    ),
    jsonb_build_object(
      'sourceMode', v_source_mode,
      'countries', v_rows,
      'expectedRoundVersion', p_expected_round_version
    )
  );
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'operationId', v_canonical_operation_id);
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;
  if v_round.status = 'open' then
    raise exception using errcode = '25000', message = 'ROUND_OPEN';
  end if;

  select coalesce(version_row.version, 0) into v_current_version
  from public.studio2_televote_round_versions version_row
  where version_row.round_id = p_round_id
  for update;
  if v_current_version is distinct from p_expected_round_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if exists (
    select 1
    from televoting.round_entries existing
    where existing.round_id = p_round_id
      and existing.entry_type = 'country'
      and not (existing.entry_key = any(v_codes))
      and exists (
        select 1
        from televoting.vote_entries vote_entry
        join televoting.vote_submissions submission on submission.id = vote_entry.submission_id
        where submission.round_id = p_round_id
          and submission.status <> 'deleted'
          and vote_entry.target_country_code = existing.entry_key
      )
  ) then
    raise exception using errcode = '23503', message = 'ENTRY_REFERENCED_BY_BALLOT';
  end if;

  for v_item in select value from jsonb_array_elements(v_rows) loop
    insert into televoting.countries(code, name, flag, flag_url)
    values (
      v_item ->> 'code',
      v_item ->> 'name',
      '✦',
      nullif(v_item ->> 'flagUrl', '')
    )
    on conflict (code) do update
    set name = excluded.name,
        flag_url = coalesce(excluded.flag_url, televoting.countries.flag_url);
  end loop;

  delete from televoting.round_entries
  where round_id = p_round_id
    and entry_type = 'country';

  insert into televoting.round_entries(
    round_id,
    entry_type,
    entry_key,
    country_code,
    subtitle,
    display_order
  )
  select
    p_round_id,
    'country',
    item ->> 'code',
    item ->> 'code',
    item ->> 'subtitle',
    (item ->> 'displayOrder')::integer
  from jsonb_array_elements(v_rows) item;

  select count(*) into v_custom_count
  from televoting.round_entries
  where round_id = p_round_id
    and entry_type = 'custom';

  with ordered as (
    select id, row_number() over (order by display_order, created_at, id) as rn
    from televoting.round_entries
    where round_id = p_round_id
      and entry_type = 'custom'
  )
  update televoting.round_entries entry_row
  set display_order = array_length(v_codes, 1) + ordered.rn
  from ordered
  where entry_row.id = ordered.id;

  update televoting.rounds
  set participant_mode = case when v_custom_count > 0 then 'mixed' else 'countries' end
  where id = p_round_id;

  insert into public.televoting_round_bindings(
    remote_round_id,
    remote_edition_id,
    edition_id,
    show_id,
    source_mode,
    last_synced_at,
    frozen_at,
    updated_at
  ) values (
    p_round_id::text,
    v_round.edition_id::text,
    v_solaris_edition_id,
    p_show_id,
    v_source_mode,
    v_now,
    null,
    v_now
  )
  on conflict (remote_round_id) do update
  set remote_edition_id = excluded.remote_edition_id,
      edition_id = excluded.edition_id,
      show_id = excluded.show_id,
      source_mode = excluded.source_mode,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at;
  -- Deliberately do not update frozen_at. Results / PR #1400 owns that field.

  insert into public.integration_events(
    service,
    event_type,
    entity_type,
    remote_id,
    entity_id,
    payload,
    status,
    attempts,
    completed_at
  ) values (
    'televoting',
    'round.lineup.synced',
    'round',
    p_round_id::text,
    p_show_id,
    jsonb_build_object(
      'solaris_edition_id', v_solaris_edition_id,
      'show_id', p_show_id,
      'source_mode', v_source_mode,
      'countries', v_codes,
      'operation_id', v_canonical_operation_id
    ),
    'completed',
    1,
    v_now
  );

  insert into televoting.admin_audit_log(
    actor_admin_id,
    action,
    target_type,
    target_id,
    new_values
  ) values (
    auth.uid(),
    'sync_round_from_solaris',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'solaris_edition_id', v_solaris_edition_id,
      'show_id', p_show_id,
      'source_mode', v_source_mode,
      'country_codes', v_codes,
      'canonical_authority', 'televoting.v3_sync_round_lineup'
    )
  );

  select coalesce(version_row.version, 0) into v_next_version
  from public.studio2_televote_round_versions version_row
  where version_row.round_id = p_round_id;

  v_result := jsonb_build_object(
    'ok', true,
    'roundId', p_round_id,
    'editionId', v_solaris_edition_id,
    'showId', p_show_id,
    'sourceMode', v_source_mode,
    'roundVersion', v_next_version,
    'countryCount', array_length(v_codes, 1),
    'operationId', v_canonical_operation_id
  );
  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$sync$;

revoke all on function televoting.v3_sync_round_lineup(
  uuid, text, uuid, jsonb, bigint, uuid, text, uuid
) from public, anon, service_role;
grant execute on function televoting.v3_sync_round_lineup(
  uuid, text, uuid, jsonb, bigint, uuid, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
commit;

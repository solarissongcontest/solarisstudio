begin;

select public.v3_register_migration_contract(
  'v3.televote.round-entry-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 consolidates round participant/configuration edits into one scoped atomic command using the existing round revision'
);

create or replace function televoting.v3_round_config_snapshot(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $snapshot$
declare
  v_round televoting.rounds%rowtype;
  v_edition_id uuid;
  v_version bigint := 0;
begin
  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select binding.edition_id into v_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.read', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select coalesce(version_row.version, 0) into v_version
  from public.studio2_televote_round_versions version_row
  where version_row.round_id = p_round_id;

  return jsonb_build_object(
    'roundId', p_round_id,
    'editionId', v_edition_id,
    'version', v_version,
    'status', v_round.status,
    'participantMode', v_round.participant_mode,
    'selfVotingMode', v_round.self_voting_mode,
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function televoting.v3_round_config_snapshot(uuid)
  from public, anon, service_role;
grant execute on function televoting.v3_round_config_snapshot(uuid)
  to authenticated;

create or replace function televoting.v3_configure_round(
  p_round_id uuid,
  p_action text,
  p_payload jsonb,
  p_expected_round_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $configure$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_round televoting.rounds%rowtype;
  v_edition_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_country_codes text[] := array[]::text[];
  v_code text;
  v_custom_count integer := 0;
  v_entry_id uuid;
  v_entry_key text;
  v_entry_ids uuid[] := array[]::uuid[];
  v_id_text text;
  v_existing_ids uuid[] := array[]::uuid[];
  v_mode text;
  v_custom_name text;
  v_short_name text;
  v_entry_code text;
  v_subtitle text;
  v_image_url text;
  v_description text;
  v_result jsonb;
begin
  if p_round_id is null
     or p_expected_round_version is null or p_expected_round_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object'
     or v_action not in ('replace_countries','save_custom','delete_custom','reorder','set_self_voting') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;
  if v_round.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select binding.edition_id into v_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.round.configure.' || v_action,
    case when v_action in ('replace_countries','delete_custom') then 'R2' else 'R1' end,
    jsonb_build_object('editionId', v_edition_id, 'roundId', p_round_id),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
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

  select jsonb_build_object(
    'participantMode', v_round.participant_mode,
    'selfVotingMode', v_round.self_voting_mode,
    'entries', coalesce(jsonb_agg(to_jsonb(entry_row) order by entry_row.display_order), '[]'::jsonb)
  )
  into v_before
  from televoting.round_entries entry_row
  where entry_row.round_id = p_round_id;

  if v_action = 'replace_countries' then
    if jsonb_typeof(v_payload -> 'countryCodes') <> 'array'
       or jsonb_array_length(v_payload -> 'countryCodes') not between 2 and 50 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    for v_code in select btrim(value #>> '{}') from jsonb_array_elements(v_payload -> 'countryCodes') loop
      if v_code is null or v_code = '' or v_code = any(v_country_codes) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      if not exists (select 1 from televoting.countries country where country.code = v_code) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_country_codes := v_country_codes || v_code;
    end loop;

    if exists (
      select 1
      from televoting.round_entries existing
      where existing.round_id = p_round_id
        and existing.entry_type = 'country'
        and not (existing.entry_key = any(v_country_codes))
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

    delete from televoting.round_entries
    where round_id = p_round_id and entry_type = 'country';

    insert into televoting.round_entries(
      round_id, entry_type, entry_key, country_code, display_order
    )
    select p_round_id, 'country', code, code, ord::integer
    from unnest(v_country_codes) with ordinality as country(code, ord);

    select count(*) into v_custom_count
    from televoting.round_entries
    where round_id = p_round_id and entry_type = 'custom';

    with ordered as (
      select id, row_number() over (order by display_order, created_at, id) as rn
      from televoting.round_entries
      where round_id = p_round_id and entry_type = 'custom'
    )
    update televoting.round_entries entry_row
    set display_order = array_length(v_country_codes, 1) + ordered.rn
    from ordered
    where entry_row.id = ordered.id;

    update televoting.rounds
    set participant_mode = case when v_custom_count > 0 then 'mixed' else 'countries' end
    where id = p_round_id;

  elsif v_action = 'save_custom' then
    v_custom_name := nullif(btrim(coalesce(v_payload ->> 'customName', '')), '');
    v_short_name := nullif(btrim(coalesce(v_payload ->> 'shortName', '')), '');
    v_entry_code := nullif(btrim(coalesce(v_payload ->> 'entryCode', '')), '');
    v_subtitle := nullif(btrim(coalesce(v_payload ->> 'subtitle', '')), '');
    v_image_url := nullif(btrim(coalesce(v_payload ->> 'imageUrl', '')), '');
    v_description := nullif(btrim(coalesce(v_payload ->> 'description', '')), '');
    if v_custom_name is null or length(v_custom_name) > 120
       or length(coalesce(v_short_name,'')) > 60
       or length(coalesce(v_entry_code,'')) > 24
       or length(coalesce(v_subtitle,'')) > 120
       or length(coalesce(v_image_url,'')) > 1000
       or length(coalesce(v_description,'')) > 1000 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if nullif(v_payload ->> 'id', '') is not null then
      begin
        v_entry_id := (v_payload ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end;
      if not exists (
        select 1 from televoting.round_entries entry_row
        where entry_row.id = v_entry_id
          and entry_row.round_id = p_round_id
          and entry_row.entry_type = 'custom'
      ) then
        raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
      end if;
      update televoting.round_entries
      set custom_name = v_custom_name,
          short_name = v_short_name,
          entry_code = v_entry_code,
          subtitle = v_subtitle,
          image_url = v_image_url,
          description = v_description
      where id = v_entry_id;
    else
      if (select count(*) from televoting.round_entries where round_id = p_round_id) >= 50 then
        raise exception using errcode = '22023', message = 'ROUND_ENTRY_LIMIT';
      end if;
      v_entry_key := 'x_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      insert into televoting.round_entries(
        round_id, entry_type, entry_key, custom_name, short_name, entry_code,
        subtitle, image_url, description, display_order
      ) values (
        p_round_id, 'custom', v_entry_key, v_custom_name, v_short_name,
        v_entry_code, v_subtitle, v_image_url, v_description,
        coalesce((select max(display_order) from televoting.round_entries where round_id = p_round_id), 0) + 1
      ) returning id into v_entry_id;
    end if;

    update televoting.rounds
    set participant_mode = case
      when exists (select 1 from televoting.round_entries where round_id = p_round_id and entry_type = 'country') then 'mixed'
      else 'custom'
    end
    where id = p_round_id;

  elsif v_action = 'delete_custom' then
    begin
      v_entry_id := (v_payload ->> 'entryId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    select entry_row.entry_key into v_entry_key
    from televoting.round_entries entry_row
    where entry_row.id = v_entry_id
      and entry_row.round_id = p_round_id
      and entry_row.entry_type = 'custom';
    if v_entry_key is null then
      raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
    end if;
    if exists (
      select 1
      from televoting.vote_entries vote_entry
      join televoting.vote_submissions submission on submission.id = vote_entry.submission_id
      where submission.round_id = p_round_id
        and submission.status <> 'deleted'
        and vote_entry.target_country_code = v_entry_key
    ) then
      raise exception using errcode = '23503', message = 'ENTRY_REFERENCED_BY_BALLOT';
    end if;

    delete from televoting.round_entries where id = v_entry_id;
    with ordered as (
      select id, row_number() over (order by display_order, created_at, id) as rn
      from televoting.round_entries
      where round_id = p_round_id
    )
    update televoting.round_entries entry_row
    set display_order = ordered.rn
    from ordered where entry_row.id = ordered.id;

    update televoting.rounds
    set participant_mode = case
      when exists (select 1 from televoting.round_entries where round_id = p_round_id and entry_type = 'custom')
       and exists (select 1 from televoting.round_entries where round_id = p_round_id and entry_type = 'country') then 'mixed'
      when exists (select 1 from televoting.round_entries where round_id = p_round_id and entry_type = 'custom') then 'custom'
      else 'countries'
    end
    where id = p_round_id;

  elsif v_action = 'reorder' then
    if jsonb_typeof(v_payload -> 'entryIds') <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    for v_id_text in select value #>> '{}' from jsonb_array_elements(v_payload -> 'entryIds') loop
      begin
        v_entry_id := v_id_text::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end;
      if v_entry_id = any(v_entry_ids) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_entry_ids := v_entry_ids || v_entry_id;
    end loop;
    select coalesce(array_agg(id order by id), array[]::uuid[]) into v_existing_ids
    from televoting.round_entries where round_id = p_round_id;
    if coalesce(array_length(v_existing_ids,1),0) <> coalesce(array_length(v_entry_ids,1),0)
       or exists (select 1 from unnest(v_entry_ids) id where not (id = any(v_existing_ids))) then
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
    update televoting.round_entries entry_row
    set display_order = ordered.ord
    from unnest(v_entry_ids) with ordinality as ordered(id, ord)
    where entry_row.id = ordered.id and entry_row.round_id = p_round_id;

  else
    v_mode := lower(btrim(coalesce(v_payload ->> 'mode', '')));
    if v_mode not in ('country_match','linked_identity','disabled','unrestricted') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    update televoting.rounds set self_voting_mode = v_mode where id = p_round_id;
  end if;

  select coalesce(version_row.version, 0) into v_next_version
  from public.studio2_televote_round_versions version_row
  where version_row.round_id = p_round_id;

  select jsonb_build_object(
    'participantMode', round_row.participant_mode,
    'selfVotingMode', round_row.self_voting_mode,
    'entries', coalesce(jsonb_agg(to_jsonb(entry_row) order by entry_row.display_order), '[]'::jsonb)
  )
  into v_after
  from televoting.rounds round_row
  left join televoting.round_entries entry_row on entry_row.round_id = round_row.id
  where round_row.id = p_round_id
  group by round_row.participant_mode, round_row.self_voting_mode;

  insert into televoting.admin_audit_log(
    actor_admin_id, action, target_type, target_id, old_values, new_values
  ) values (
    auth.uid(),
    'configure_round_' || v_action,
    'round',
    p_round_id::text,
    v_before,
    v_after
  );

  v_result := jsonb_build_object(
    'ok', true,
    'roundId', p_round_id,
    'action', v_action,
    'roundVersion', v_next_version,
    'operationId', v_canonical_operation_id
  );
  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$configure$;

revoke all on function televoting.v3_configure_round(
  uuid, text, jsonb, bigint, uuid, text, uuid
) from public, anon, service_role;
grant execute on function televoting.v3_configure_round(
  uuid, text, jsonb, bigint, uuid, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
commit;

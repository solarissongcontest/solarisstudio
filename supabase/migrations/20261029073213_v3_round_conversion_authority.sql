begin;
select public.v3_register_migration_contract('v3.televote.round-conversion-authority',1,'forward_fix_only',false,null,'Extend the round configuration authority to conversion settings, atomic calculation persistence and publication lifecycle.');
create function private.v3_conversion_input_hash(p_round_id uuid) returns text language sql stable set search_path=pg_catalog as $$
 select md5(jsonb_build_array(to_jsonb(r),
 (select jsonb_agg(to_jsonb(e) order by e.id) from televoting.round_entries e where e.round_id=r.id),
 (select jsonb_agg(to_jsonb(s) order by s.id) from televoting.vote_submissions s where s.round_id=r.id),
 (select jsonb_agg(to_jsonb(e) order by e.id) from televoting.vote_entries e join televoting.vote_submissions s on s.id=e.submission_id where s.round_id=r.id))::text) from televoting.rounds r where r.id=p_round_id
$$;
revoke all on function private.v3_conversion_input_hash(uuid) from public,anon,authenticated,service_role;
create function televoting.v3_conversion_context(p_round_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private,televoting as $$
declare e uuid; result jsonb;
begin
 perform private.v3_require_active_auth_session();
 select edition_id into e from public.televoting_round_bindings where remote_round_id=p_round_id::text;
 if e is null or not private.studio2_user_has_capability(auth.uid(),'voting.read',e) or not public.studio2_access_allowed('voting.read',e,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 select to_jsonb(r)||jsonb_build_object('round_version',v.version,'input_hash',private.v3_conversion_input_hash(r.id)) into result from televoting.rounds r join public.studio2_televote_round_versions v on v.round_id=r.id where r.id=p_round_id;
 return result;
end $$;
revoke all on function televoting.v3_conversion_context(uuid) from public,anon,service_role;
grant execute on function televoting.v3_conversion_context(uuid) to authenticated;

-- Owner-only implementation of the existing v3_configure_round command.
create function private.v3_configure_round_conversion(p_round_id uuid,p_action text,p_payload jsonb,p_expected_round_version bigint,p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting as $command$
declare r televoting.rounds%rowtype; e uuid; v bigint; claim jsonb; result jsonb; patch jsonb; after_round televoting.rounds%rowtype; codes text[]; row_codes text[]; calc integer; at_time timestamptz:=clock_timestamp(); item jsonb;
begin
 perform private.v3_require_active_auth_session();
 if p_expected_round_version is null or p_expected_round_version<0 or p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'VALIDATION' using errcode='22023'; end if;
 select * into r from televoting.rounds where id=p_round_id for update;
 select edition_id into e from public.televoting_round_bindings where remote_round_id=p_round_id::text;
 if r.id is null or e is null then raise exception 'STATE_CHANGED' using errcode='P0002'; end if;
 if not private.studio2_user_has_capability(auth.uid(),'voting.manage',e) or not public.studio2_access_allowed('voting.manage',e,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'televote.round.configure.'||p_action,'R2',jsonb_build_object('roundId',p_round_id,'payload',p_payload,'expectedRoundVersion',p_expected_round_version));
 if coalesce((claim->>'replayed')::boolean,false) then return claim->'result'; end if;
 select version into v from public.studio2_televote_round_versions where round_id=p_round_id for update;
 if v is distinct from p_expected_round_version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
 if exists(select 1 from public.editions where id=e and status='archived') or exists(select 1 from televoting.editions where id=r.edition_id and is_archived) then raise exception 'Archived edition' using errcode='23514'; end if;
 if r.results_status='published' or (r.results_status='locked' and not (p_action='conversion_status' and p_payload->>'status'='published')) then raise exception 'Finalized conversion is immutable' using errcode='23514'; end if;
 if p_action='conversion_config' then
  patch:=p_payload;
  if exists(select 1 from jsonb_object_keys(patch) k where k not in ('total_points_to_distribute','rank_exponent','televote_engine_version','ballot_exponent','breadth_floor','breadth_exponent','support_exponent','rank_boost_strength','rank_boost_shape','public_advanced_transparency','broadcast_display_mode')) then raise exception 'Invalid conversion field' using errcode='22023'; end if;
  select * into after_round from jsonb_populate_record(r,patch);
  if after_round.total_points_to_distribute<0 or after_round.rank_exponent not between 0.01 and 5 or after_round.televote_engine_version not in ('rank-weighted-v1','robust-televote-v2') or after_round.ballot_exponent not between 0.1 and 2 or after_round.breadth_floor not between 0 and 1 or after_round.breadth_exponent not between 0.1 and 2 or after_round.support_exponent not between 0.1 and 3 or after_round.rank_boost_strength not between 0 and 3 or after_round.rank_boost_shape not between 0.1 and 4 or after_round.broadcast_display_mode not in ('original','converted','combined') or exists(select 1 from jsonb_each(patch) p where p.value='null'::jsonb or p.value::text in ('"NaN"','"Infinity"','"-Infinity"')) then raise exception 'Invalid conversion configuration' using errcode='22023'; end if;
  if r.status='open' then raise exception 'ROUND_OPEN' using errcode='23514'; end if;
  update televoting.rounds set total_points_to_distribute=after_round.total_points_to_distribute,rank_exponent=after_round.rank_exponent,televote_engine_version=after_round.televote_engine_version,ballot_exponent=after_round.ballot_exponent,breadth_floor=after_round.breadth_floor,breadth_exponent=after_round.breadth_exponent,support_exponent=after_round.support_exponent,rank_boost_strength=after_round.rank_boost_strength,rank_boost_shape=after_round.rank_boost_shape,public_advanced_transparency=after_round.public_advanced_transparency,broadcast_display_mode=after_round.broadcast_display_mode,
  results_outdated=r.results_outdated or (r.calculation_version>0 and (to_jsonb(r)-array['public_advanced_transparency','broadcast_display_mode']) is distinct from (to_jsonb(after_round)-array['public_advanced_transparency','broadcast_display_mode'])) where id=r.id;
 elsif p_action='conversion_calculation' then
  lock table televoting.vote_submissions,televoting.vote_entries,televoting.round_entries in share row exclusive mode;
  if p_payload->>'inputHash' is distinct from private.v3_conversion_input_hash(r.id) then raise exception 'Calculation inputs changed' using errcode='40001'; end if;
  if r.status<>'closed' then raise exception 'Voting must be closed' using errcode='23514'; end if;
  select array_agg(entry_key order by entry_key) into codes from televoting.round_entries where round_id=r.id;
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_typeof(p_payload->'influenceRows') is distinct from 'array' then raise exception 'Invalid calculation rows' using errcode='22023'; end if;
  select array_agg(x->>'country_code' order by x->>'country_code') into row_codes from jsonb_array_elements(p_payload->'rows') x;
  if codes is null or codes is distinct from row_codes or exists(select 1 from jsonb_array_elements(p_payload->'rows') x where (x->>'engine_version') is distinct from r.televote_engine_version or (x->>'final_points')::numeric<0 or (x->>'final_points')::numeric<>trunc((x->>'final_points')::numeric)) or (select sum((x->>'final_points')::numeric) not in (0,r.total_points_to_distribute) from jsonb_array_elements(p_payload->'rows') x) then raise exception 'Calculation coverage/total/engine mismatch' using errcode='23514'; end if;
  calc:=r.calculation_version+1;
  delete from televoting.round_results where round_id=r.id;
  delete from televoting.round_influence_results where round_id=r.id;
  for item in select value from jsonb_array_elements(p_payload->'rows') loop
   insert into televoting.round_results select (jsonb_populate_record(null::televoting.round_results,item||jsonb_build_object('id',gen_random_uuid(),'round_id',r.id,'calculation_version',calc,'calculated_at',at_time,'created_at',at_time,'updated_at',at_time,'calculated_by_username',coalesce((select email from auth.users where id=auth.uid()),'Solaris organizer')))).*;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'influenceRows') loop
   insert into televoting.round_influence_results select (jsonb_populate_record(null::televoting.round_influence_results,item||jsonb_build_object('id',gen_random_uuid(),'round_id',r.id,'calculation_version',calc,'created_at',at_time))).*;
  end loop;
  update televoting.rounds set results_status='calculated',calculation_version=calc,calculated_at=at_time,calculated_by=auth.uid(),calculated_by_username=coalesce((select email from auth.users where id=auth.uid()),'Solaris organizer'),calc_participant_codes=codes,results_outdated=false where id=r.id;
 elsif p_action='conversion_status' then
  if p_payload->>'status' is null or p_payload->>'status' not in ('calculated','locked','published') or r.calculation_version=0 or r.results_outdated then raise exception 'Recalculate before finalizing' using errcode='23514'; end if;
  select array_agg(entry_key order by entry_key) into codes from televoting.round_entries where round_id=r.id;
  select array_agg(country_code order by country_code) into row_codes from televoting.round_results where round_id=r.id and calculation_version=r.calculation_version and engine_version=r.televote_engine_version;
  if codes is null or codes is distinct from row_codes or r.status<>'closed' or (select sum(final_points) not in (0,r.total_points_to_distribute) from televoting.round_results where round_id=r.id and calculation_version=r.calculation_version) then raise exception 'Incomplete conversion cannot be finalized' using errcode='23514'; end if;
  update televoting.rounds set results_status=p_payload->>'status' where id=r.id;
 else raise exception 'Invalid conversion action' using errcode='22023'; end if;
 insert into televoting.admin_audit_log(actor_admin_id,action,target_type,target_id,old_values,new_values) values(auth.uid(),p_action,'round',r.id::text,to_jsonb(r),jsonb_build_object('operationId',p_operation_id,'request',p_payload));
 insert into public.integration_events(service,event_type,entity_type,remote_id,payload,status,attempts,completed_at,updated_at) values('televoting','round.'||p_action,'round',r.id::text,jsonb_build_object('operationId',p_operation_id),'completed',1,now(),now());
 result:=jsonb_build_object('ok',true,'id',r.id,'version',coalesce(calc,r.calculation_version),'calculatedAt',at_time,'outdated',(select results_outdated from televoting.rounds where id=r.id),'roundVersion',(select version from public.studio2_televote_round_versions where round_id=r.id),'operationId',p_operation_id);
 return private.studio2_complete_operation(p_operation_id,result);
end $command$;
revoke all on function private.v3_configure_round_conversion(uuid,text,jsonb,bigint,uuid,text) from public,anon,authenticated,service_role;

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
  if p_action in ('conversion_config','conversion_calculation','conversion_status') then
    return private.v3_configure_round_conversion(p_round_id,p_action,p_payload,p_expected_round_version,p_operation_id,p_idempotency_key);
  end if;
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
-- Recovery is readback of the original actor-bound semantic request. Re-enter
-- the same authority so capability/session revocation also denies retries.
create function televoting.v3_recover_conversion_calculation(p_round_id uuid,p_expected_round_version bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,televoting as $$
declare receipt public.studio2_operation_receipts%rowtype;
begin
 perform private.v3_require_active_auth_session();
 select * into receipt from public.studio2_operation_receipts where operation_id=p_operation_id and actor_id=auth.uid() and command='televote.round.configure.conversion_calculation';
 if receipt.operation_id is null then raise exception 'UNKNOWN' using errcode='P0002'; end if;
 if receipt.scope->>'roundId' is distinct from p_round_id::text or (receipt.scope->>'expectedRoundVersion')::bigint is distinct from p_expected_round_version then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return private.v3_configure_round_conversion(p_round_id,'conversion_calculation',receipt.scope->'payload',p_expected_round_version,p_operation_id,receipt.idempotency_key);
end $$;
revoke all on function televoting.v3_recover_conversion_calculation(uuid,bigint,uuid) from public,anon,service_role;
grant execute on function televoting.v3_recover_conversion_calculation(uuid,bigint,uuid) to authenticated;
commit;

begin;

-- System V3 / country identity: move the shared Solaris flag display crop behind
-- the canonical command boundary. The original flag image remains authoritative
-- media and is never mutated by this operation.
--
-- S13: additive, forward-only and bounded to one country row per command.
select public.v3_register_migration_contract(
  '20261023204600_v3_country_flag_crop_command_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern country flag display-crop preflight, CAS update, receipt and event authority'
);

create or replace function private.v3_country_flag_crop_state_version(
  p_country_id uuid,
  p_flag_image text,
  p_flag_crop_x numeric,
  p_flag_crop_y numeric,
  p_flag_crop_zoom numeric
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, extensions
as $version$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'countryId', p_country_id,
          'flagImage', p_flag_image,
          'flagCropX', p_flag_crop_x,
          'flagCropY', p_flag_crop_y,
          'flagCropZoom', p_flag_crop_zoom
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$version$;

revoke all on function private.v3_country_flag_crop_state_version(uuid, text, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_country_flag_crop_preflight(
  p_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_actor uuid := auth.uid();
  v_country public.countries;
  v_state_version text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_country_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not coalesce(private.studio2_user_has_capability(v_actor, 'delegation.manage', null), false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select country.*
  into v_country
  from public.countries country
  where country.id = p_country_id;

  if v_country.id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_state_version := private.v3_country_flag_crop_state_version(
    v_country.id,
    v_country.flag_image,
    v_country.flag_crop_x,
    v_country.flag_crop_y,
    v_country.flag_crop_zoom
  );

  return jsonb_build_object(
    'countryId', v_country.id,
    'countryName', v_country.name,
    'flagImage', v_country.flag_image,
    'crop', jsonb_build_object(
      'x', v_country.flag_crop_x,
      'y', v_country.flag_crop_y,
      'zoom', v_country.flag_crop_zoom
    ),
    'stateVersion', v_state_version,
    'blockers', case
      when v_country.flag_image is null then jsonb_build_array('FLAG_SOURCE_MISSING')
      else '[]'::jsonb
    end,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.studio2_country_flag_crop_preflight(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_country_flag_crop_preflight(uuid)
  to authenticated;

create or replace function public.studio2_update_country_flag_crop(
  p_country_id uuid,
  p_flag_crop_x numeric,
  p_flag_crop_y numeric,
  p_flag_crop_zoom numeric,
  p_expected_state_version text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_country public.countries;
  v_before jsonb;
  v_after jsonb;
  v_live_version text;
  v_next_version text;
  v_result jsonb;
  v_event_version bigint;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_country_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_expected_state_version !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_flag_crop_x is null or p_flag_crop_x < 0 or p_flag_crop_x > 100
     or p_flag_crop_y is null or p_flag_crop_y < 0 or p_flag_crop_y > 100
     or p_flag_crop_zoom is null or p_flag_crop_zoom < 1 or p_flag_crop_zoom > 2 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not coalesce(private.studio2_user_has_capability(v_actor, 'delegation.manage', null), false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'country.update_identity',
    'R1',
    jsonb_build_object(
      'countryId', p_country_id,
      'fieldSet', 'flag_display_crop'
    ),
    jsonb_build_object(
      'countryId', p_country_id,
      'flagCropX', p_flag_crop_x,
      'flagCropY', p_flag_crop_y,
      'flagCropZoom', p_flag_crop_zoom,
      'expectedStateVersion', p_expected_state_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(p_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select country.*
  into v_country
  from public.countries country
  where country.id = p_country_id
  for update;

  if v_country.id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_country.flag_image is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_live_version := private.v3_country_flag_crop_state_version(
    v_country.id,
    v_country.flag_image,
    v_country.flag_crop_x,
    v_country.flag_crop_y,
    v_country.flag_crop_zoom
  );

  if v_live_version is distinct from p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'Refresh Flag QA, review the current source and crop, then retry with a new operation id.';
  end if;

  v_before := jsonb_build_object(
    'flagImage', v_country.flag_image,
    'flagCropX', v_country.flag_crop_x,
    'flagCropY', v_country.flag_crop_y,
    'flagCropZoom', v_country.flag_crop_zoom,
    'stateVersion', v_live_version
  );

  update public.countries
  set
    flag_crop_x = p_flag_crop_x,
    flag_crop_y = p_flag_crop_y,
    flag_crop_zoom = p_flag_crop_zoom,
    updated_at = now()
  where id = p_country_id
  returning * into v_country;

  v_next_version := private.v3_country_flag_crop_state_version(
    v_country.id,
    v_country.flag_image,
    v_country.flag_crop_x,
    v_country.flag_crop_y,
    v_country.flag_crop_zoom
  );

  v_after := jsonb_build_object(
    'flagImage', v_country.flag_image,
    'flagCropX', v_country.flag_crop_x,
    'flagCropY', v_country.flag_crop_y,
    'flagCropZoom', v_country.flag_crop_zoom,
    'stateVersion', v_next_version
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    v_actor,
    'country_flag_crop_update',
    'countries',
    p_country_id::text,
    v_before,
    v_after
  );

  -- countries does not yet expose a dedicated monotonic revision column. The
  -- opaque SHA-256 stateVersion is the CAS authority; this event sequence value
  -- is a transaction-local ordering token and the exact post-state fingerprint
  -- is carried in the payload.
  v_event_version := txid_current();

  perform private.v3_emit_domain_event(
    'country.identity_changed',
    'country',
    p_country_id::text,
    v_event_version,
    p_operation_id,
    null,
    null,
    jsonb_build_object(
      'change', 'flag_display_crop',
      'countryId', p_country_id,
      'before', v_before,
      'after', v_after
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'countryId', v_country.id,
    'countryName', v_country.name,
    'flagImage', v_country.flag_image,
    'crop', jsonb_build_object(
      'x', v_country.flag_crop_x,
      'y', v_country.flag_crop_y,
      'zoom', v_country.flag_crop_zoom
    ),
    'stateVersion', v_next_version,
    'invalidates', jsonb_build_array(
      'country identity projection',
      'country/Wiki/results identity',
      'MySolaris country',
      'Organizer Country'
    ),
    'operationId', p_operation_id
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return public.studio2_reconcile_operation(p_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_update_country_flag_crop(
  uuid, numeric, numeric, numeric, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_update_country_flag_crop(
  uuid, numeric, numeric, numeric, text, uuid, text
) to authenticated;

comment on function public.studio2_country_flag_crop_preflight(uuid) is
  'V3 country flag crop preflight. Returns exact flag source, stored crop and opaque CAS state version for delegation.manage callers.';

comment on function public.studio2_update_country_flag_crop(uuid, numeric, numeric, numeric, text, uuid, text) is
  'V3 S2-governed country flag display-crop command with delegation.manage authorization, row-lock CAS, idempotency, audit, receipt reconciliation and country.identity_changed DomainEvent. Never mutates flag_image.';

commit;

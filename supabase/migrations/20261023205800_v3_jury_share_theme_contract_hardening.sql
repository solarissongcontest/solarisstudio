begin;

-- JSC-7 coordination hardening requested by the Organizer lane.
-- Keep Jury Share branding authority narrower than generic edition management,
-- expose deterministic state versions, require reasons for consequential
-- version/lifecycle changes, and enforce the canonical structured composition
-- envelope rather than accepting arbitrary top-level blobs.
select public.v3_register_migration_contract(
  'v3.results.jury-share-theme-contract-hardening-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Introduce edition.share_theme.view/manage capabilities, structured composition validation, reasoned version/lifecycle commands and deterministic stateVersion outputs for JSC-7.'
);

insert into public.studio2_capabilities (
  key,
  domain,
  label,
  description,
  access_level
)
values
  (
    'edition.share_theme.view',
    'edition',
    'View edition share themes',
    'View edition-scoped Jury Share branding configuration and validation state.',
    'read'
  ),
  (
    'edition.share_theme.manage',
    'edition',
    'Manage edition share themes',
    'Create, validate through trusted server infrastructure, activate and archive edition-scoped Jury Share branding.',
    'operate'
  )
on conflict (key) do update
set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

-- Compatibility rollout: users who already have broad edition management keep
-- the share-theme capability, while the RPC boundary becomes narrow enough for
-- future dedicated grants without implicitly conferring Results authority.
insert into public.studio2_role_capabilities (role_key, capability)
select rc.role_key, new_capability.capability
from public.studio2_role_capabilities rc
cross join (
  values
    ('edition.share_theme.view'::text),
    ('edition.share_theme.manage'::text)
) as new_capability(capability)
where rc.capability = 'edition.manage'
on conflict (role_key, capability) do nothing;

create or replace function private.v3_validate_jury_share_theme_composition(
  p_composition jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate$
declare
  v_unknown_keys text[];
  v_safe_area jsonb;
  v_artwork jsonb;
begin
  if p_composition is null or jsonb_typeof(p_composition) <> 'object' then
    return jsonb_build_object(
      'valid', false,
      'code', 'COMPOSITION_NOT_OBJECT'
    );
  end if;

  select array_agg(key order by key)
  into v_unknown_keys
  from jsonb_object_keys(p_composition) key
  where key not in (
    'artwork',
    'scoreboard',
    'header',
    'background',
    'footer',
    'decorativeAssets',
    'safeArea'
  );

  if coalesce(array_length(v_unknown_keys, 1), 0) > 0 then
    return jsonb_build_object(
      'valid', false,
      'code', 'UNKNOWN_COMPOSITION_FIELDS',
      'fields', to_jsonb(v_unknown_keys)
    );
  end if;

  if not (p_composition ? 'artwork')
     or not (p_composition ? 'scoreboard')
     or not (p_composition ? 'header')
     or not (p_composition ? 'background')
     or not (p_composition ? 'footer')
     or not (p_composition ? 'decorativeAssets')
     or not (p_composition ? 'safeArea') then
    return jsonb_build_object(
      'valid', false,
      'code', 'MISSING_COMPOSITION_SECTION'
    );
  end if;

  if jsonb_typeof(p_composition -> 'scoreboard') <> 'object'
     or jsonb_typeof(p_composition -> 'header') <> 'object'
     or jsonb_typeof(p_composition -> 'background') <> 'object'
     or jsonb_typeof(p_composition -> 'footer') <> 'object'
     or jsonb_typeof(p_composition -> 'decorativeAssets') <> 'array'
     or jsonb_typeof(p_composition -> 'safeArea') <> 'object'
     or (
       p_composition -> 'artwork' <> 'null'::jsonb
       and jsonb_typeof(p_composition -> 'artwork') <> 'object'
     ) then
    return jsonb_build_object(
      'valid', false,
      'code', 'INVALID_COMPOSITION_SECTION_TYPE'
    );
  end if;

  v_safe_area := p_composition -> 'safeArea';
  if not (v_safe_area ? 'top')
     or not (v_safe_area ? 'right')
     or not (v_safe_area ? 'bottom')
     or not (v_safe_area ? 'left')
     or jsonb_typeof(v_safe_area -> 'top') <> 'number'
     or jsonb_typeof(v_safe_area -> 'right') <> 'number'
     or jsonb_typeof(v_safe_area -> 'bottom') <> 'number'
     or jsonb_typeof(v_safe_area -> 'left') <> 'number'
     or (v_safe_area ->> 'top')::numeric < 0
     or (v_safe_area ->> 'right')::numeric < 0
     or (v_safe_area ->> 'bottom')::numeric < 0
     or (v_safe_area ->> 'left')::numeric < 0
     or (v_safe_area ->> 'top')::numeric > 1920
     or (v_safe_area ->> 'bottom')::numeric > 1920
     or (v_safe_area ->> 'left')::numeric > 1080
     or (v_safe_area ->> 'right')::numeric > 1080 then
    return jsonb_build_object(
      'valid', false,
      'code', 'INVALID_SAFE_AREA'
    );
  end if;

  v_artwork := p_composition -> 'artwork';
  if v_artwork <> 'null'::jsonb then
    if nullif(v_artwork ->> 'assetId', '') is null
       or coalesce(v_artwork ->> 'placement', '') not in (
         'top', 'top_fade', 'background', 'bottom', 'bottom_fade', 'full'
       )
       or coalesce(v_artwork ->> 'scale', '') not in ('cover', 'contain')
       or coalesce(v_artwork ->> 'fadeDirection', '') not in (
         'none', 'up', 'down', 'radial'
       )
       or jsonb_typeof(v_artwork -> 'focalX') <> 'number'
       or jsonb_typeof(v_artwork -> 'focalY') <> 'number'
       or jsonb_typeof(v_artwork -> 'opacity') <> 'number'
       or jsonb_typeof(v_artwork -> 'blurPx') <> 'number'
       or jsonb_typeof(v_artwork -> 'scrimStrength') <> 'number'
       or (v_artwork ->> 'focalX')::numeric not between 0 and 1
       or (v_artwork ->> 'focalY')::numeric not between 0 and 1
       or (v_artwork ->> 'opacity')::numeric not between 0 and 1
       or (v_artwork ->> 'blurPx')::numeric not between 0 and 100
       or (v_artwork ->> 'scrimStrength')::numeric not between 0 and 1
       or (
         v_artwork ? 'fadeStart'
         and (
           jsonb_typeof(v_artwork -> 'fadeStart') <> 'number'
           or (v_artwork ->> 'fadeStart')::numeric not between 0 and 1
         )
       )
       or (
         v_artwork ? 'fadeEnd'
         and (
           jsonb_typeof(v_artwork -> 'fadeEnd') <> 'number'
           or (v_artwork ->> 'fadeEnd')::numeric not between 0 and 1
         )
       ) then
      return jsonb_build_object(
        'valid', false,
        'code', 'INVALID_ARTWORK_TREATMENT'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', 'OK'
  );
end
$validate$;

revoke all on function private.v3_validate_jury_share_theme_composition(jsonb)
  from public, anon, authenticated;

create or replace function private.v3_guard_jury_share_theme_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $guard$
declare
  v_structure jsonb;
begin
  if jsonb_typeof(new.composition_json) <> 'object'
     or pg_column_size(new.composition_json) > 131072 then
    raise exception 'Jury Share Edition composition must be a bounded object'
      using errcode = '22023';
  end if;

  v_structure := private.v3_validate_jury_share_theme_composition(
    new.composition_json
  );
  if not coalesce((v_structure ->> 'valid')::boolean, false) then
    raise exception 'Invalid Jury Share Edition composition: %',
      coalesce(v_structure ->> 'code', 'UNKNOWN')
      using errcode = '22023', detail = v_structure::text;
  end if;

  new.composition_hash := private.v3_jury_share_theme_composition_hash(
    new.composition_json
  );

  if tg_op = 'INSERT' then
    if new.state <> 'draft' or new.revision <> 1 then
      raise exception 'New Jury Share Edition themes must start as draft revision 1'
        using errcode = '23514';
    end if;
    new.validation_state := 'unvalidated';
    new.validation_result := null;
    new.activated_at := null;
    new.archived_at := null;
    new.invalidated_at := null;
    new.invalid_reason := null;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.edition_id is distinct from old.edition_id
     or new.version is distinct from old.version
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Jury Share Edition theme identity is immutable'
      using errcode = '55000';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Jury Share Edition theme revision must advance exactly once'
      using errcode = '23514';
  end if;

  if old.state <> 'draft'
     and new.composition_json is distinct from old.composition_json then
    raise exception 'Activated Jury Share Edition composition is immutable'
      using errcode = '55000';
  end if;

  if old.state = 'draft' and new.state not in ('draft', 'ready', 'invalid') then
    raise exception 'Invalid Jury Share Edition draft transition'
      using errcode = '23514';
  elsif old.state = 'ready' and new.state not in ('ready', 'archived', 'invalid') then
    raise exception 'Invalid Jury Share Edition ready transition'
      using errcode = '23514';
  elsif old.state = 'archived' and new.state <> 'archived' then
    raise exception 'Archived Jury Share Edition themes are terminal'
      using errcode = '55000';
  elsif old.state = 'invalid' and new.state <> 'invalid' then
    raise exception 'Invalid Jury Share Edition themes are terminal; create a new version'
      using errcode = '55000';
  end if;

  if old.state = 'draft'
     and new.state = 'draft'
     and new.composition_json is distinct from old.composition_json then
    new.validation_state := 'unvalidated';
    new.validation_result := null;
  end if;

  if new.state = 'ready' then
    if new.validation_state <> 'valid' then
      raise exception 'Jury Share Edition theme must pass server validation before activation'
        using errcode = '23514';
    end if;
    new.activated_at := coalesce(old.activated_at, now());
    new.archived_at := null;
    new.invalidated_at := null;
    new.invalid_reason := null;
  elsif new.state = 'archived' then
    if old.activated_at is null then
      raise exception 'Only an activated Jury Share Edition theme can be archived'
        using errcode = '23514';
    end if;
    new.activated_at := old.activated_at;
    new.archived_at := coalesce(old.archived_at, now());
    new.invalidated_at := null;
    new.invalid_reason := null;
  elsif new.state = 'invalid' then
    if nullif(btrim(coalesce(new.invalid_reason, '')), '') is null then
      raise exception 'Invalid Jury Share Edition theme requires a reason'
        using errcode = '22023';
    end if;
    new.invalidated_at := coalesce(old.invalidated_at, now());
    new.archived_at := old.archived_at;
    new.activated_at := old.activated_at;
  else
    new.activated_at := old.activated_at;
    new.archived_at := old.archived_at;
    new.invalidated_at := old.invalidated_at;
    new.invalid_reason := old.invalid_reason;
  end if;

  new.updated_at := now();
  return new;
end
$guard$;

create or replace function private.v3_jury_share_theme_state_version(
  p_edition_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $version$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws('|',
          p_edition_id::text,
          coalesce(
            string_agg(
              concat_ws(':',
                theme.id::text,
                theme.version::text,
                theme.revision::text,
                theme.state,
                theme.composition_hash,
                theme.validation_state
              ),
              ',' order by theme.version
            ),
            ''
          )
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from private.v3_edition_jury_share_themes theme
  where theme.edition_id = p_edition_id
$version$;

revoke all on function private.v3_jury_share_theme_state_version(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_jury_share_theme_state(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $state$
declare
  v_rows jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;

  if not private.studio2_request_is_service_role()
     and not public.studio2_access_allowed(
       'edition.share_theme.view',
       p_edition_id,
       false
     ) then
    raise exception 'Missing Solaris capability: edition.share_theme.view'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', theme.id,
      'version', theme.version,
      'revision', theme.revision,
      'state', theme.state,
      'composition', theme.composition_json,
      'compositionHash', theme.composition_hash,
      'validationState', theme.validation_state,
      'validationResult', theme.validation_result,
      'createdAt', theme.created_at,
      'updatedAt', theme.updated_at,
      'activatedAt', theme.activated_at,
      'archivedAt', theme.archived_at,
      'invalidatedAt', theme.invalidated_at,
      'invalidReason', theme.invalid_reason
    ) order by theme.version desc
  ), '[]'::jsonb)
  into v_rows
  from private.v3_edition_jury_share_themes theme
  where theme.edition_id = p_edition_id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'selection', private.v3_jury_share_edition_theme_selection(p_edition_id),
    'themes', v_rows,
    'stateVersion', private.v3_jury_share_theme_state_version(p_edition_id),
    'serverTime', now()
  );
end
$state$;

-- Remove the broader-capability draft command installed by the parent JSC-7
-- migration before exposing the narrower, reason-aware signature.
revoke all on function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, uuid
) from public, anon, authenticated;
drop function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, uuid
);

create or replace function public.studio2_save_jury_share_theme_draft(
  p_edition_id uuid,
  p_theme_id uuid,
  p_composition jsonb,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_before private.v3_edition_jury_share_themes%rowtype;
  v_next_version integer;
  v_hash text;
  v_structure jsonb;
  v_result jsonb;
begin
  if not public.studio2_access_allowed(
    'edition.share_theme.manage', p_edition_id, false
  ) then
    raise exception 'Missing Solaris capability: edition.share_theme.manage'
      using errcode = '42501';
  end if;

  v_structure := private.v3_validate_jury_share_theme_composition(p_composition);
  if p_edition_id is null
     or jsonb_typeof(p_composition) <> 'object'
     or pg_column_size(p_composition) > 131072
     or not coalesce((v_structure ->> 'valid')::boolean, false)
     or p_expected_revision is null
     or p_expected_revision < 0
     or length(coalesce(p_reason, '')) > 500
     or (
       p_theme_id is null
       and nullif(btrim(coalesce(p_reason, '')), '') is null
     ) then
    raise exception 'Invalid Jury Share Edition theme draft request'
      using errcode = '22023';
  end if;

  v_hash := private.v3_jury_share_theme_composition_hash(p_composition);
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.save_draft',
    'R1',
    jsonb_build_object('editionId', p_edition_id, 'themeId', p_theme_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'compositionHash', v_hash,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform 1 from public.editions edition
  where edition.id = p_edition_id
  for update;
  if not found then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  if p_theme_id is null then
    if p_expected_revision <> 0 then
      raise exception 'New Jury Share Edition theme expects revision 0'
        using errcode = '40001';
    end if;

    select coalesce(max(theme.version), 0) + 1
    into v_next_version
    from private.v3_edition_jury_share_themes theme
    where theme.edition_id = p_edition_id;

    insert into private.v3_edition_jury_share_themes (
      edition_id,
      version,
      revision,
      state,
      composition_json,
      composition_hash,
      created_by
    ) values (
      p_edition_id,
      v_next_version,
      1,
      'draft',
      p_composition,
      v_hash,
      auth.uid()
    )
    returning * into v_theme;
  else
    select theme.* into v_before
    from private.v3_edition_jury_share_themes theme
    where theme.id = p_theme_id
      and theme.edition_id = p_edition_id
    for update;

    if v_before.id is null then
      raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
    end if;
    if v_before.state <> 'draft' then
      raise exception 'Only draft Jury Share Edition themes can be edited'
        using errcode = '23514';
    end if;
    if v_before.revision <> p_expected_revision then
      raise exception 'VERSION_CONFLICT' using errcode = '40001';
    end if;

    update private.v3_edition_jury_share_themes
    set
      composition_json = p_composition,
      revision = revision + 1,
      validation_state = case
        when composition_hash = v_hash then validation_state
        else 'unvalidated'
      end,
      validation_result = case
        when composition_hash = v_hash then validation_result
        else null
      end
    where id = p_theme_id
    returning * into v_theme;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'jury_share_theme_draft_saved',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    p_edition_id,
    case when v_before.id is null then null else jsonb_build_object(
      'revision', v_before.revision,
      'state', v_before.state,
      'compositionHash', v_before.composition_hash,
      'validationState', v_before.validation_state
    ) end,
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'validationState', v_theme.validation_state,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'validationState', v_theme.validation_state,
    'stateVersion', private.v3_jury_share_theme_state_version(p_edition_id)
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$save$;

revoke all on function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, text, uuid
) from public, anon;
grant execute on function public.studio2_save_jury_share_theme_draft(
  uuid, uuid, jsonb, bigint, uuid, text, text, uuid
) to authenticated;

revoke all on function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) from public, anon, authenticated;
drop function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, uuid
);

create or replace function public.studio2_activate_jury_share_theme(
  p_theme_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $activate$
declare
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_previous private.v3_edition_jury_share_themes%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id;

  if v_theme.id is null then
    raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed(
    'edition.share_theme.manage', v_theme.edition_id, false
  ) then
    raise exception 'Missing Solaris capability: edition.share_theme.manage'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(p_reason) > 500 then
    raise exception 'Activation reason is required and must be at most 500 characters'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.activate',
    'R2',
    jsonb_build_object('editionId', v_theme.edition_id, 'themeId', p_theme_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'reason', btrim(p_reason)
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform 1 from public.editions edition
  where edition.id = v_theme.edition_id
  for update;

  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id
  for update;

  if v_theme.state <> 'draft' then
    raise exception 'Only draft Jury Share Edition themes can be activated'
      using errcode = '23514';
  end if;
  if v_theme.revision <> p_expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  if v_theme.validation_state <> 'valid' then
    raise exception 'Jury Share Edition theme has not passed server validation'
      using errcode = '23514';
  end if;

  select theme.* into v_previous
  from private.v3_edition_jury_share_themes theme
  where theme.edition_id = v_theme.edition_id
    and theme.state = 'ready'
    and theme.id <> p_theme_id
  for update;

  if v_previous.id is not null then
    update private.v3_edition_jury_share_themes
    set state = 'archived', revision = revision + 1
    where id = v_previous.id;
  end if;

  update private.v3_edition_jury_share_themes
  set state = 'ready', revision = revision + 1
  where id = p_theme_id
  returning * into v_theme;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, before_data, after_data
  ) values (
    auth.uid(),
    'jury_share_theme_activated',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    v_theme.edition_id,
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'supersededThemeId', v_previous.id
    ),
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'activatedAt', v_theme.activated_at,
      'reason', btrim(p_reason)
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'activatedAt', v_theme.activated_at,
    'stateVersion', private.v3_jury_share_theme_state_version(v_theme.edition_id)
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$activate$;

revoke all on function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, text, uuid
) from public, anon;
grant execute on function public.studio2_activate_jury_share_theme(
  uuid, bigint, uuid, text, text, uuid
) to authenticated;

revoke all on function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, uuid
) from public, anon, authenticated;
drop function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, uuid
);

create or replace function public.studio2_archive_jury_share_theme(
  p_theme_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $archive$
declare
  v_theme private.v3_edition_jury_share_themes%rowtype;
  v_edition_status text;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id;

  if v_theme.id is null then
    raise exception 'Jury Share Edition theme not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed(
    'edition.share_theme.manage', v_theme.edition_id, false
  ) then
    raise exception 'Missing Solaris capability: edition.share_theme.manage'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null
     or length(p_reason) > 500 then
    raise exception 'Archive reason is required and must be at most 500 characters'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'results.jury_share_theme.archive',
    'R2',
    jsonb_build_object('editionId', v_theme.edition_id, 'themeId', p_theme_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'reason', btrim(p_reason)
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object(
        'replayed', true,
        'operationId', v_claim ->> 'operationId',
        'status', v_claim ->> 'status'
      );
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select edition.status into v_edition_status
  from public.editions edition
  where edition.id = v_theme.edition_id
  for update;

  select theme.* into v_theme
  from private.v3_edition_jury_share_themes theme
  where theme.id = p_theme_id
  for update;

  if v_theme.state <> 'ready' then
    raise exception 'Only the ready Jury Share Edition theme can become historical'
      using errcode = '23514';
  end if;
  if v_theme.revision <> p_expected_revision then
    raise exception 'VERSION_CONFLICT' using errcode = '40001';
  end if;
  if v_edition_status not in ('completed', 'archived') then
    raise exception 'Edition must be completed before its Jury Share theme is archived'
      using errcode = '23514';
  end if;

  update private.v3_edition_jury_share_themes
  set state = 'archived', revision = revision + 1
  where id = p_theme_id
  returning * into v_theme;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, after_data
  ) values (
    auth.uid(),
    'jury_share_theme_archived',
    'v3_edition_jury_share_themes',
    v_theme.id::text,
    v_theme.edition_id,
    jsonb_build_object(
      'operationId', v_operation_id,
      'version', v_theme.version,
      'revision', v_theme.revision,
      'state', v_theme.state,
      'compositionHash', v_theme.composition_hash,
      'archivedAt', v_theme.archived_at,
      'reason', btrim(p_reason)
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', v_operation_id,
    'themeId', v_theme.id,
    'editionId', v_theme.edition_id,
    'version', v_theme.version,
    'revision', v_theme.revision,
    'state', v_theme.state,
    'compositionHash', v_theme.composition_hash,
    'archivedAt', v_theme.archived_at,
    'stateVersion', private.v3_jury_share_theme_state_version(v_theme.edition_id)
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$archive$;

revoke all on function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, text, uuid
) from public, anon;
grant execute on function public.studio2_archive_jury_share_theme(
  uuid, bigint, uuid, text, text, uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;

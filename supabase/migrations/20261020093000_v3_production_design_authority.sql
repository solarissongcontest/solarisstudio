begin;

-- Solaris Studio V3 O11 / System authority for Organizer Design & Broadcast.
--
-- The legacy editor spans theme -> edition -> N show writes in the browser. A
-- failed write in the middle can therefore leave one edition in a mixed visual
-- state. This migration keeps the existing tables as canonical storage, but
-- moves the consequential mutation boundary into one exact-edition transaction
-- with optimistic concurrency, S2 receipts/idempotency, S4 domain events and a
-- bounded read projection. Legacy direct writes remain readable during cutover;
-- compatibility version triggers make them visible to the new CAS boundary.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.production-design-authority-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive exact-edition production design authority. Existing theme/edition/show storage remains canonical; repair forward if later production evidence requires contract refinement.'
);
select set_config('request.jwt.claim.role', '', true);

alter table public.editions
  add column if not exists production_config_version bigint not null default 1;
alter table public.shows
  add column if not exists production_config_version bigint not null default 1;

alter table public.editions
  drop constraint if exists editions_production_config_version_check;
alter table public.editions
  add constraint editions_production_config_version_check
  check (production_config_version >= 1) not valid;
alter table public.editions
  validate constraint editions_production_config_version_check;

alter table public.shows
  drop constraint if exists shows_production_config_version_check;
alter table public.shows
  add constraint shows_production_config_version_check
  check (production_config_version >= 1) not valid;
alter table public.shows
  validate constraint shows_production_config_version_check;

create or replace function private.v3_bump_production_config_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $bump$
begin
  if tg_table_name = 'editions' then
    if new.theme_id is distinct from old.theme_id
       and new.production_config_version is not distinct from old.production_config_version then
      new.production_config_version := old.production_config_version + 1;
    end if;
    return new;
  end if;

  if tg_table_name = 'shows' then
    if (
      new.theme_id is distinct from old.theme_id
      or new.broadcast_config is distinct from old.broadcast_config
    ) and new.production_config_version is not distinct from old.production_config_version then
      new.production_config_version := old.production_config_version + 1;
    end if;
    return new;
  end if;

  return new;
end
$bump$;

revoke all on function private.v3_bump_production_config_version()
  from public, anon, authenticated;

drop trigger if exists v3_editions_production_config_version on public.editions;
create trigger v3_editions_production_config_version
before update on public.editions
for each row execute function private.v3_bump_production_config_version();

drop trigger if exists v3_shows_production_config_version on public.shows;
create trigger v3_shows_production_config_version
before update on public.shows
for each row execute function private.v3_bump_production_config_version();

create or replace function private.v3_production_design_snapshot(
  p_edition_id uuid,
  p_show_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_edition public.editions%rowtype;
  v_theme_config jsonb;
  v_shows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;

  select edition_row.*
  into v_edition
  from public.editions edition_row
  where edition_row.id = p_edition_id;

  if v_edition.id is null then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  if p_show_id is not null and not exists (
    select 1
    from public.shows show_row
    where show_row.id = p_show_id
      and show_row.edition_id = p_edition_id
  ) then
    raise exception 'Show is outside the requested edition' using errcode = '42501';
  end if;

  select theme_row.config
  into v_theme_config
  from public.themes theme_row
  where theme_row.id = v_edition.theme_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', show_row.id,
        'name', show_row.name,
        'themeId', show_row.theme_id,
        'themeConfig', show_theme.config,
        'broadcastConfig', coalesce(show_row.broadcast_config, '{}'::jsonb),
        'productionConfigVersion', show_row.production_config_version,
        'participantCount', (
          select count(*)
          from public.participants participant
          where participant.show_id = show_row.id
            and participant.edition_id = p_edition_id
        )
      ) order by show_row.id
    ),
    '[]'::jsonb
  )
  into v_shows
  from public.shows show_row
  left join public.themes show_theme on show_theme.id = show_row.theme_id
  where show_row.edition_id = p_edition_id
    and (p_show_id is null or show_row.id = p_show_id);

  return jsonb_build_object(
    'editionId', v_edition.id,
    'editionSlug', v_edition.slug,
    'editionThemeId', v_edition.theme_id,
    'editionThemeConfig', v_theme_config,
    'editionProductionConfigVersion', v_edition.production_config_version,
    'showId', p_show_id,
    'shows', v_shows
  );
end
$snapshot$;

revoke all on function private.v3_production_design_snapshot(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_production_design_state_version(
  p_snapshot jsonb
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, extensions
as $version$
  select encode(
    extensions.digest(
      convert_to(coalesce(p_snapshot, '{}'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$version$;

revoke all on function private.v3_production_design_state_version(jsonb)
  from public, anon, authenticated;

create or replace function public.admin_production_design_projection(
  p_edition_id uuid,
  p_show_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_snapshot jsonb;
begin
  if auth.uid() is null
     or public.studio2_access_allowed('edition.manage', p_edition_id, true) is not true then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  v_snapshot := private.v3_production_design_snapshot(p_edition_id, p_show_id);

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'stateVersion', private.v3_production_design_state_version(v_snapshot),
    'state', v_snapshot,
    'serverTime', now()
  );
end
$projection$;

revoke all on function public.admin_production_design_projection(uuid, uuid)
  from public, anon;
grant execute on function public.admin_production_design_projection(uuid, uuid)
  to authenticated, service_role;

comment on function public.admin_production_design_projection(uuid, uuid) is
  'Bounded exact-edition Design/Broadcast projection with a deterministic CAS state version. Requires edition.manage.';

create or replace function public.admin_apply_production_design(
  p_edition_id uuid,
  p_request jsonb,
  p_expected_state_version text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_actor uuid := auth.uid();
  v_request jsonb := coalesce(p_request, '{}'::jsonb);
  v_mode text := nullif(btrim(coalesce(p_request ->> 'mode', '')), '');
  v_show_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_expected text := lower(nullif(btrim(coalesce(p_expected_state_version, '')), ''));
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_command text := 'edition.update';
  v_edition public.editions%rowtype;
  v_show public.shows%rowtype;
  v_theme_id uuid;
  v_theme_config jsonb;
  v_broadcast_config jsonb;
  v_scoreboard_config jsonb;
  v_effective_broadcast jsonb;
  v_show_configs jsonb;
  v_show_config jsonb;
  v_payload_show_id uuid;
  v_payload_show_ids uuid[] := array[]::uuid[];
  v_show_count integer := 0;
  v_affected_show_ids uuid[] := array[]::uuid[];
  v_event_id uuid;
  v_result jsonb;
  v_sqlstate text;
  v_sqlerrm text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_request) <> 'object'
     or pg_column_size(v_request) > 262144 then
    raise exception 'Production design request must be a bounded JSON object'
      using errcode = '22023';
  end if;
  if v_expected is null or v_expected !~ '^[0-9a-f]{64}$' then
    raise exception 'Expected Production state version is required'
      using errcode = '22023';
  end if;
  if v_mode not in ('edition_default', 'show_override', 'show_reset') then
    raise exception 'Unsupported Production design operation'
      using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 1000 then
    raise exception 'Production change reason is too long' using errcode = '22023';
  end if;

  if nullif(v_request ->> 'showId', '') is not null then
    begin
      v_show_id := (v_request ->> 'showId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid Production show id' using errcode = '22023';
    end;
  end if;

  if v_mode = 'edition_default' and v_show_id is not null then
    raise exception 'Edition-default save cannot target one show' using errcode = '22023';
  end if;
  if v_mode <> 'edition_default' and v_show_id is null then
    raise exception 'Show override/reset requires one exact show' using errcode = '22023';
  end if;

  if v_mode <> 'show_reset' then
    if jsonb_typeof(v_request -> 'themeConfig') <> 'object'
       or jsonb_typeof(v_request -> 'broadcastConfig') <> 'object'
       or jsonb_typeof(v_request -> 'scoreboardConfig') <> 'object' then
      raise exception 'Theme, broadcast and scoreboard configs are required'
        using errcode = '22023';
    end if;
    if pg_column_size(v_request -> 'themeConfig') > 131072
       or pg_column_size(v_request -> 'broadcastConfig') > 131072
       or pg_column_size(v_request -> 'scoreboardConfig') > 131072 then
      raise exception 'Production configuration is too large' using errcode = '22023';
    end if;
  end if;

  if v_mode = 'show_reset' then
    if jsonb_typeof(v_request -> 'broadcastConfig') <> 'object'
       or jsonb_typeof(v_request -> 'scoreboardConfig') <> 'object' then
      raise exception 'Reset requires reviewed edition-default broadcast and scoreboard config'
        using errcode = '22023';
    end if;
  end if;

  v_theme_config := coalesce(v_request -> 'themeConfig', '{}'::jsonb)
    || jsonb_build_object('scoreboardConfig', coalesce(v_request -> 'scoreboardConfig', '{}'::jsonb));
  v_broadcast_config := coalesce(v_request -> 'broadcastConfig', '{}'::jsonb);
  v_scoreboard_config := coalesce(v_request -> 'scoreboardConfig', '{}'::jsonb);
  v_effective_broadcast := v_broadcast_config
    || jsonb_build_object('scoreboard', v_scoreboard_config);

  -- One edition lock serializes canonical Production design changes without a
  -- global lock and closes the legacy browser-loop race during cutover.
  perform pg_advisory_xact_lock(
    hashtextextended('v3-production-design:' || p_edition_id::text, 0)
  );

  select edition_row.*
  into v_edition
  from public.editions edition_row
  where edition_row.id = p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  if public.studio2_access_allowed('edition.manage', p_edition_id, true) is not true then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  if v_show_id is null then
    perform 1
    from public.shows show_row
    where show_row.edition_id = p_edition_id
    order by show_row.id
    for update;
  else
    select show_row.*
    into v_show
    from public.shows show_row
    where show_row.id = v_show_id
      and show_row.edition_id = p_edition_id
    for update;

    if v_show.id is null then
      raise exception 'Show is outside the reviewed edition' using errcode = '42501';
    end if;
  end if;

  -- Lock every currently referenced theme in deterministic order. Theme edits
  -- outside the command still alter the snapshot hash, while these locks stop a
  -- concurrent writer after the reviewed state has been revalidated.
  perform 1
  from public.themes theme_row
  where theme_row.id in (
    select v_edition.theme_id
    union
    select show_row.theme_id
    from public.shows show_row
    where show_row.edition_id = p_edition_id
      and (v_show_id is null or show_row.id = v_show_id)
  )
  order by theme_row.id
  for update;

  v_before := private.v3_production_design_snapshot(p_edition_id, v_show_id);
  v_before_version := private.v3_production_design_state_version(v_before);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', v_show_id,
      'productionMode', v_mode
    ),
    jsonb_build_object(
      'request', v_request,
      'expectedStateVersion', v_expected,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'correlationId', v_claim ->> 'correlationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_before_version is distinct from v_expected then
    return private.studio2_fail_operation(
      v_canonical_operation_id,
      'VERSION_CONFLICT',
      jsonb_build_object(
        'expectedStateVersion', v_expected,
        'currentStateVersion', v_before_version,
        'editionId', p_edition_id,
        'showId', v_show_id
      )
    );
  end if;

  if v_mode = 'edition_default' then
    v_show_configs := coalesce(v_request -> 'showConfigs', '[]'::jsonb);
    if jsonb_typeof(v_show_configs) <> 'array' then
      return private.studio2_fail_operation(
        v_canonical_operation_id,
        'VALIDATION',
        jsonb_build_object('reason', 'showConfigs must be an array')
      );
    end if;

    select count(*) into v_show_count
    from public.shows show_row
    where show_row.edition_id = p_edition_id;

    for v_show_config in select value from jsonb_array_elements(v_show_configs)
    loop
      if jsonb_typeof(v_show_config) <> 'object'
         or jsonb_typeof(v_show_config -> 'broadcastConfig') <> 'object'
         or jsonb_typeof(v_show_config -> 'scoreboardConfig') <> 'object' then
        return private.studio2_fail_operation(
          v_canonical_operation_id,
          'VALIDATION',
          jsonb_build_object('reason', 'Each show config must contain showId, broadcastConfig and scoreboardConfig')
        );
      end if;

      begin
        v_payload_show_id := (v_show_config ->> 'showId')::uuid;
      exception when invalid_text_representation or null_value_not_allowed then
        return private.studio2_fail_operation(
          v_canonical_operation_id,
          'VALIDATION',
          jsonb_build_object('reason', 'Invalid show id in showConfigs')
        );
      end;

      if v_payload_show_id = any(v_payload_show_ids) then
        return private.studio2_fail_operation(
          v_canonical_operation_id,
          'VALIDATION',
          jsonb_build_object('reason', 'Duplicate show id in showConfigs')
        );
      end if;
      if not exists (
        select 1 from public.shows show_row
        where show_row.id = v_payload_show_id
          and show_row.edition_id = p_edition_id
      ) then
        return private.studio2_fail_operation(
          v_canonical_operation_id,
          'AUTHORIZATION',
          jsonb_build_object('reason', 'showConfigs contains a show outside the reviewed edition')
        );
      end if;
      v_payload_show_ids := array_append(v_payload_show_ids, v_payload_show_id);
    end loop;

    if cardinality(v_payload_show_ids) <> v_show_count
       or exists (
         select 1
         from public.shows show_row
         where show_row.edition_id = p_edition_id
           and not (show_row.id = any(v_payload_show_ids))
       ) then
      return private.studio2_fail_operation(
        v_canonical_operation_id,
        'STATE_CHANGED',
        jsonb_build_object(
          'reason', 'The edition show set changed since review',
          'currentShowCount', v_show_count,
          'reviewedShowCount', cardinality(v_payload_show_ids)
        )
      );
    end if;
  end if;

  begin
    if v_mode = 'edition_default' then
      v_theme_id := v_edition.theme_id;

      -- Reuse a theme only when it cannot modify another edition or a show in
      -- another edition. Shared themes become a new private edition theme.
      if v_theme_id is null
         or exists (
           select 1 from public.editions other_edition
           where other_edition.id <> p_edition_id
             and other_edition.theme_id = v_theme_id
         )
         or exists (
           select 1 from public.shows other_show
           where other_show.edition_id <> p_edition_id
             and other_show.theme_id = v_theme_id
         ) then
        insert into public.themes (name, description, config, is_public)
        values (
          'Production design · ' || coalesce(v_edition.slug, p_edition_id::text),
          'Organizer-managed edition Production design',
          v_theme_config,
          false
        )
        returning id into v_theme_id;
      else
        update public.themes
        set config = v_theme_config
        where id = v_theme_id;
      end if;

      update public.editions
      set
        theme_id = v_theme_id,
        production_config_version = production_config_version + 1
      where id = p_edition_id
      returning * into v_edition;

      for v_show_config in select value from jsonb_array_elements(v_show_configs)
      loop
        v_payload_show_id := (v_show_config ->> 'showId')::uuid;
        v_effective_broadcast := (v_show_config -> 'broadcastConfig')
          || jsonb_build_object('scoreboard', v_show_config -> 'scoreboardConfig');

        update public.shows
        set
          theme_id = v_theme_id,
          broadcast_config = v_effective_broadcast,
          production_config_version = production_config_version + 1
        where id = v_payload_show_id
          and edition_id = p_edition_id;

        v_affected_show_ids := array_append(v_affected_show_ids, v_payload_show_id);
      end loop;

      insert into public.admin_audit_log (
        actor_id, action, table_name, record_id, before_data, after_data
      ) values (
        v_actor,
        'production_design_defaults_saved',
        'editions',
        p_edition_id::text,
        jsonb_build_object(
          'stateVersion', v_before_version,
          'themeId', v_before -> 'editionThemeId'
        ),
        jsonb_build_object(
          'mode', v_mode,
          'themeId', v_theme_id,
          'affectedShowIds', to_jsonb(v_affected_show_ids),
          'reason', v_reason,
          'operationId', v_canonical_operation_id
        )
      );

      select private.v3_emit_domain_event(
        'edition.changed',
        'edition',
        p_edition_id::text,
        v_edition.production_config_version,
        v_canonical_operation_id,
        p_edition_id,
        null,
        jsonb_build_object(
          'changeKind', 'production_design',
          'affectedShowIds', to_jsonb(v_affected_show_ids)
        ),
        1,
        array[]::text[]
      ) into v_event_id;

      for v_show in
        select * from public.shows
        where edition_id = p_edition_id
          and id = any(v_affected_show_ids)
        order by id
      loop
        select private.v3_emit_domain_event(
          'show.changed',
          'show',
          v_show.id::text,
          v_show.production_config_version,
          v_canonical_operation_id,
          p_edition_id,
          v_show.id,
          jsonb_build_object('changeKind', 'production_design_default'),
          1,
          array[]::text[]
        ) into v_event_id;
      end loop;

    elsif v_mode = 'show_override' then
      v_theme_id := v_show.theme_id;

      if v_theme_id is null
         or v_theme_id = v_edition.theme_id
         or exists (
           select 1 from public.editions edition_ref
           where edition_ref.theme_id = v_theme_id
         )
         or exists (
           select 1 from public.shows other_show
           where other_show.id <> v_show_id
             and other_show.theme_id = v_theme_id
         ) then
        insert into public.themes (name, description, config, is_public)
        values (
          'Production override · ' || coalesce(v_edition.slug, p_edition_id::text) || ' · ' || v_show.name,
          'Organizer-managed show Production override',
          v_theme_config,
          false
        )
        returning id into v_theme_id;
      else
        update public.themes
        set config = v_theme_config
        where id = v_theme_id;
      end if;

      update public.shows
      set
        theme_id = v_theme_id,
        broadcast_config = v_effective_broadcast,
        production_config_version = production_config_version + 1
      where id = v_show_id
        and edition_id = p_edition_id
      returning * into v_show;

      v_affected_show_ids := array[v_show_id];

      insert into public.admin_audit_log (
        actor_id, action, table_name, record_id, before_data, after_data
      ) values (
        v_actor,
        'production_show_override_saved',
        'shows',
        v_show_id::text,
        jsonb_build_object('stateVersion', v_before_version),
        jsonb_build_object(
          'mode', v_mode,
          'editionId', p_edition_id,
          'themeId', v_theme_id,
          'reason', v_reason,
          'operationId', v_canonical_operation_id
        )
      );

      select private.v3_emit_domain_event(
        'show.changed',
        'show',
        v_show.id::text,
        v_show.production_config_version,
        v_canonical_operation_id,
        p_edition_id,
        v_show.id,
        jsonb_build_object('changeKind', 'production_design_override'),
        1,
        array[]::text[]
      ) into v_event_id;

    else
      if v_edition.theme_id is null then
        return private.studio2_fail_operation(
          v_canonical_operation_id,
          'STATE_CHANGED',
          jsonb_build_object('reason', 'Edition has no default theme to reset to')
        );
      end if;

      update public.shows
      set
        theme_id = v_edition.theme_id,
        broadcast_config = v_effective_broadcast,
        production_config_version = production_config_version + 1
      where id = v_show_id
        and edition_id = p_edition_id
      returning * into v_show;

      v_affected_show_ids := array[v_show_id];

      insert into public.admin_audit_log (
        actor_id, action, table_name, record_id, before_data, after_data
      ) values (
        v_actor,
        'production_show_override_reset',
        'shows',
        v_show_id::text,
        jsonb_build_object('stateVersion', v_before_version),
        jsonb_build_object(
          'mode', v_mode,
          'editionId', p_edition_id,
          'themeId', v_edition.theme_id,
          'reason', v_reason,
          'operationId', v_canonical_operation_id
        )
      );

      select private.v3_emit_domain_event(
        'show.changed',
        'show',
        v_show.id::text,
        v_show.production_config_version,
        v_canonical_operation_id,
        p_edition_id,
        v_show.id,
        jsonb_build_object('changeKind', 'production_design_reset'),
        1,
        array[]::text[]
      ) into v_event_id;
    end if;

    v_after := private.v3_production_design_snapshot(p_edition_id, v_show_id);
    v_after_version := private.v3_production_design_state_version(v_after);

    v_result := jsonb_build_object(
      'ok', true,
      'mode', v_mode,
      'editionId', p_edition_id,
      'showId', v_show_id,
      'affectedShowIds', to_jsonb(v_affected_show_ids),
      'stateVersion', v_after_version,
      'editionProductionConfigVersion', v_after -> 'editionProductionConfigVersion',
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'serverTime', now(),
      'replayed', false
    );

    return private.studio2_complete_operation(v_canonical_operation_id, v_result);
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_sqlerrm = message_text;

    return private.studio2_fail_operation(
      v_canonical_operation_id,
      'DATABASE',
      jsonb_build_object(
        'sqlstate', v_sqlstate,
        'message', left(coalesce(v_sqlerrm, 'Production design transaction failed'), 1000),
        'editionId', p_edition_id,
        'showId', v_show_id,
        'mode', v_mode
      )
    );
  end;
end
$apply$;

revoke all on function public.admin_apply_production_design(
  uuid, jsonb, text, uuid, text, text
) from public, anon;
grant execute on function public.admin_apply_production_design(
  uuid, jsonb, text, uuid, text, text
) to authenticated, service_role;

comment on function public.admin_apply_production_design(uuid, jsonb, text, uuid, text, text) is
  'Atomic exact-edition R2 Design/Broadcast mutation. Uses deterministic reviewed-state CAS, S2 idempotency/receipt, audit and existing edition.changed/show.changed S4 event contracts.';

notify pgrst, 'reload schema';

commit;

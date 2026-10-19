begin;

-- V3 System / #588: jury roster mutations are official voting configuration.
-- Keep the existing voters table as canonical storage, but move consequential
-- Organizer writes behind an exact-edition/show, versioned, idempotent command.
select public.v3_register_migration_contract(
  '20261019224500_v3_jury_roster_commands',
  1,
  'forward_fix_only',
  false,
  null,
  'Governed Jury roster materialize/add/update/reorder/remove operations with exact scope, CAS, receipts and evidence-safe deletion'
);

create table if not exists private.v3_jury_roster_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

revoke all on table private.v3_jury_roster_versions
  from public, anon, authenticated;
grant select on table private.v3_jury_roster_versions to service_role;

create or replace function private.v3_bump_jury_roster_version(
  p_edition_id uuid,
  p_show_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
declare
  v_version bigint;
begin
  if p_edition_id is null or p_show_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = p_show_id
      and show_row.edition_id = p_edition_id
  ) then
    raise exception 'Jury roster scope does not match canonical show'
      using errcode = '23514';
  end if;

  insert into private.v3_jury_roster_versions (
    show_id,
    edition_id,
    version,
    updated_at
  ) values (
    p_show_id,
    p_edition_id,
    2,
    now()
  )
  on conflict (show_id)
  do update set
    edition_id = excluded.edition_id,
    version = private.v3_jury_roster_versions.version + 1,
    updated_at = now()
  returning version into v_version;

  return v_version;
end
$bump$;

revoke all on function private.v3_bump_jury_roster_version(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_touch_jury_roster_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
begin
  if tg_op = 'UPDATE'
     and (old.edition_id is distinct from new.edition_id
          or old.show_id is distinct from new.show_id) then
    perform private.v3_bump_jury_roster_version(old.edition_id, old.show_id);
    perform private.v3_bump_jury_roster_version(new.edition_id, new.show_id);
  elsif tg_op = 'DELETE' then
    -- The show still exists for an ordinary roster delete. If the voter is
    -- disappearing because the show itself is cascading away, there is no
    -- roster projection left to version.
    if old.show_id is not null and exists (
      select 1 from public.shows show_row where show_row.id = old.show_id
    ) then
      perform private.v3_bump_jury_roster_version(old.edition_id, old.show_id);
    end if;
  else
    perform private.v3_bump_jury_roster_version(new.edition_id, new.show_id);
  end if;

  return coalesce(new, old);
end
$touch$;

revoke all on function private.v3_touch_jury_roster_version()
  from public, anon, authenticated;

drop trigger if exists v3_touch_jury_roster_version on public.voters;
create trigger v3_touch_jury_roster_version
after insert or update or delete on public.voters
for each row execute function private.v3_touch_jury_roster_version();

create or replace function private.v3_jury_roster_voter_dependencies(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $dependencies$
  select jsonb_build_object(
    'scoreRows', (
      select count(*)
      from public.jury_votes vote
      where vote.edition_id = p_edition_id
        and vote.show_id = p_show_id
        and vote.voter_id = p_voter_id
    ),
    'ballotStatuses', (
      select count(*)
      from public.jury_ballot_statuses status_row
      where status_row.edition_id = p_edition_id
        and status_row.show_id = p_show_id
        and status_row.voter_id = p_voter_id
    ),
    'ballotSubmissions', (
      select count(*)
      from public.jury_ballot_submissions ballot
      where ballot.edition_id = p_edition_id
        and ballot.show_id = p_show_id
        and ballot.voter_id = p_voter_id
    )
  )
$dependencies$;

revoke all on function private.v3_jury_roster_voter_dependencies(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_jury_roster_voter_removable(
  p_dependencies jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $removable$
  select
    coalesce((p_dependencies ->> 'scoreRows')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'ballotStatuses')::bigint, 0) = 0
    and coalesce((p_dependencies ->> 'ballotSubmissions')::bigint, 0) = 0
$removable$;

revoke all on function private.v3_jury_roster_voter_removable(jsonb)
  from public, anon, authenticated;

create or replace function public.studio2_jury_roster_preview(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_version bigint;
  v_roster jsonb;
  v_missing jsonb;
  v_show_name text;
  v_roster_count integer;
  v_missing_count integer;
begin
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select show_row.name
  into v_show_name
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;

  if v_show_name is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  select coalesce(version_row.version, 1)
  into v_version
  from (select 1) seed
  left join private.v3_jury_roster_versions version_row
    on version_row.show_id = p_show_id
   and version_row.edition_id = p_edition_id;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', voter.id,
        'countryId', voter.country_id,
        'contestEntityId', voter.contest_entity_id,
        'name', voter.name,
        'kind', voter.kind,
        'flagImage', voter.flag_image,
        'accentColor', voter.accent_color,
        'sortOrder', voter.sort_order,
        'dependencies', deps.value,
        'canRemove', private.v3_jury_roster_voter_removable(deps.value)
      ) order by voter.sort_order, voter.name, voter.id
    ), '[]'::jsonb),
    count(*)::integer
  into v_roster, v_roster_count
  from public.voters voter
  cross join lateral (
    select private.v3_jury_roster_voter_dependencies(
      p_edition_id,
      p_show_id,
      voter.id
    ) as value
  ) deps
  where voter.edition_id = p_edition_id
    and voter.show_id = p_show_id;

  with participant_candidates as (
    select distinct on (
      coalesce(
        participant.contest_entity_id::text,
        'country:' || participant.country_id::text
      )
    )
      participant.country_id,
      participant.contest_entity_id,
      coalesce(entity.display_name, country.name, 'Participant') as name,
      coalesce(entity.flag_image, country.flag_image) as flag_image,
      coalesce(country.accent_color, '#8888aa') as accent_color,
      coalesce(participant.running_order, 2147483647) as running_order,
      participant.created_at
    from public.participants participant
    left join public.contest_entities entity
      on entity.id = participant.contest_entity_id
     and entity.edition_id = p_edition_id
    left join public.countries country
      on country.id = participant.country_id
    where participant.edition_id = p_edition_id
      and participant.show_id = p_show_id
      and (participant.country_id is not null or participant.contest_entity_id is not null)
      and participant.participation_status not in ('withdrawn', 'disqualified')
    order by
      coalesce(
        participant.contest_entity_id::text,
        'country:' || participant.country_id::text
      ),
      coalesce(participant.running_order, 2147483647),
      participant.created_at,
      participant.id
  ), missing_candidates as (
    select candidate.*
    from participant_candidates candidate
    where not exists (
      select 1
      from public.voters voter
      where voter.edition_id = p_edition_id
        and voter.show_id = p_show_id
        and (
          (candidate.contest_entity_id is not null
            and voter.contest_entity_id = candidate.contest_entity_id)
          or
          (candidate.contest_entity_id is null
            and candidate.country_id is not null
            and voter.country_id = candidate.country_id)
        )
    )
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'countryId', missing.country_id,
        'contestEntityId', missing.contest_entity_id,
        'name', missing.name,
        'flagImage', missing.flag_image,
        'accentColor', missing.accent_color
      ) order by missing.running_order, missing.name
    ), '[]'::jsonb),
    count(*)::integer
  into v_missing, v_missing_count
  from missing_candidates missing;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show_name,
    'expectedVersion', v_version,
    'explicitRoster', v_roster_count > 0,
    'roster', v_roster,
    'missingParticipants', v_missing,
    'missingParticipantCount', v_missing_count,
    'risk', jsonb_build_object(
      'materialize', 'R2',
      'add', 'R2',
      'update', 'R2',
      'reorder', 'R2',
      'remove', 'R3'
    ),
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_jury_roster_preview(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_jury_roster_preview(uuid, uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_jury_roster_change(
  p_edition_id uuid,
  p_show_id uuid,
  p_change_kind text,
  p_payload jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_kind text := lower(btrim(coalesce(p_change_kind, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_risk text;
  v_command text;
  v_claim jsonb;
  v_operation_id uuid;
  v_show public.shows;
  v_version bigint;
  v_result jsonb;
  v_voter public.voters;
  v_voter_id uuid;
  v_country_id uuid;
  v_entity_id uuid;
  v_name text;
  v_kind_value text;
  v_flag_image text;
  v_accent_color text;
  v_dependencies jsonb;
  v_roster_count integer;
  v_created_count integer := 0;
  v_changed_count integer := 0;
  v_order_count integer;
  v_distinct_order_count integer;
  v_roster_ids uuid[];
  v_requested_ids uuid[];
  v_next_sort integer;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if p_edition_id is null
     or p_show_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_kind not in ('materialize', 'add', 'update', 'reorder', 'remove') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_risk := case when v_kind = 'remove' then 'R3' else 'R2' end;
  v_command := 'jury.roster.' || v_kind;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'changeKind', v_kind
    ),
    jsonb_build_object(
      'payload', v_payload,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'operationId', v_claim ->> 'operationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true
    );
  end if;

  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_kind = 'remove' then
    if v_reason is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    perform private.studio2_require_fresh_auth(300);
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for update;

  if v_show.id is null then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  insert into private.v3_jury_roster_versions (
    show_id,
    edition_id,
    version,
    updated_at
  ) values (
    p_show_id,
    p_edition_id,
    1,
    now()
  )
  on conflict (show_id) do nothing;

  select version_row.version
  into v_version
  from private.v3_jury_roster_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id
  for update;

  if v_version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  select count(*)::integer
  into v_roster_count
  from public.voters voter
  where voter.edition_id = p_edition_id
    and voter.show_id = p_show_id;

  v_before := jsonb_build_object(
    'version', v_version,
    'rosterCount', v_roster_count
  );

  if v_kind = 'materialize' then
    with participant_candidates as (
      select distinct on (
        coalesce(
          participant.contest_entity_id::text,
          'country:' || participant.country_id::text
        )
      )
        participant.country_id,
        participant.contest_entity_id,
        coalesce(entity.display_name, country.name, 'Participant') as name,
        coalesce(entity.flag_image, country.flag_image) as flag_image,
        coalesce(country.accent_color, '#8888aa') as accent_color,
        coalesce(participant.running_order, 2147483647) as running_order,
        participant.created_at
      from public.participants participant
      left join public.contest_entities entity
        on entity.id = participant.contest_entity_id
       and entity.edition_id = p_edition_id
      left join public.countries country
        on country.id = participant.country_id
      where participant.edition_id = p_edition_id
        and participant.show_id = p_show_id
        and (participant.country_id is not null or participant.contest_entity_id is not null)
        and participant.participation_status not in ('withdrawn', 'disqualified')
      order by
        coalesce(
          participant.contest_entity_id::text,
          'country:' || participant.country_id::text
        ),
        coalesce(participant.running_order, 2147483647),
        participant.created_at,
        participant.id
    ), missing_candidates as (
      select candidate.*
      from participant_candidates candidate
      where not exists (
        select 1
        from public.voters voter
        where voter.edition_id = p_edition_id
          and voter.show_id = p_show_id
          and (
            (candidate.contest_entity_id is not null
              and voter.contest_entity_id = candidate.contest_entity_id)
            or
            (candidate.contest_entity_id is null
              and candidate.country_id is not null
              and voter.country_id = candidate.country_id)
          )
      )
    ), numbered as (
      select missing.*,
             row_number() over (order by missing.running_order, missing.name) as row_number
      from missing_candidates missing
    ), inserted as (
      insert into public.voters (
        edition_id,
        show_id,
        country_id,
        contest_entity_id,
        name,
        kind,
        flag_image,
        accent_color,
        sort_order
      )
      select
        p_edition_id,
        p_show_id,
        numbered.country_id,
        numbered.contest_entity_id,
        numbered.name,
        case when numbered.country_id is not null then 'country' else 'custom' end,
        numbered.flag_image,
        numbered.accent_color,
        coalesce((select max(voter.sort_order) from public.voters voter
                  where voter.edition_id = p_edition_id and voter.show_id = p_show_id), 0)
          + numbered.row_number::integer
      from numbered
      returning id
    )
    select count(*)::integer into v_created_count from inserted;

    v_changed_count := v_created_count;

  elsif v_kind = 'add' then
    begin
      v_country_id := nullif(v_payload ->> 'countryId', '')::uuid;
      v_entity_id := nullif(v_payload ->> 'contestEntityId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    v_kind_value := lower(btrim(coalesce(v_payload ->> 'kind', '')));
    v_name := nullif(btrim(coalesce(v_payload ->> 'name', '')), '');
    v_flag_image := nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), '');
    v_accent_color := coalesce(nullif(btrim(coalesce(v_payload ->> 'accentColor', '')), ''), '#8888aa');

    if v_kind_value not in ('country', 'external-country', 'organisation', 'person', 'custom')
       or v_name is null
       or char_length(v_name) > 160
       or (v_country_id is null and v_entity_id is null and v_kind_value = 'country') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if v_country_id is not null and not exists (
      select 1 from public.countries country where country.id = v_country_id
    ) then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;

    if v_entity_id is not null and not exists (
      select 1
      from public.contest_entities entity
      where entity.id = v_entity_id
        and entity.edition_id = p_edition_id
        and (v_country_id is null or entity.country_id is not distinct from v_country_id)
    ) then
      raise exception using errcode = '42501', message = 'AUTHORIZATION';
    end if;

    if exists (
      select 1
      from public.voters voter
      where voter.edition_id = p_edition_id
        and voter.show_id = p_show_id
        and (
          (v_entity_id is not null and voter.contest_entity_id = v_entity_id)
          or
          (v_entity_id is null and v_country_id is not null and voter.country_id = v_country_id)
        )
    ) then
      raise exception using errcode = '23505', message = 'STATE_CHANGED';
    end if;

    select coalesce(max(voter.sort_order), 0) + 1
    into v_next_sort
    from public.voters voter
    where voter.edition_id = p_edition_id
      and voter.show_id = p_show_id;

    insert into public.voters (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      name,
      kind,
      flag_image,
      accent_color,
      sort_order
    ) values (
      p_edition_id,
      p_show_id,
      v_country_id,
      v_entity_id,
      v_name,
      v_kind_value,
      v_flag_image,
      v_accent_color,
      v_next_sort
    )
    returning id into v_voter_id;

    v_changed_count := 1;

  elsif v_kind = 'update' then
    begin
      v_voter_id := nullif(v_payload ->> 'voterId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    v_name := nullif(btrim(coalesce(v_payload ->> 'name', '')), '');
    v_flag_image := nullif(btrim(coalesce(v_payload ->> 'flagImage', '')), '');
    v_accent_color := coalesce(nullif(btrim(coalesce(v_payload ->> 'accentColor', '')), ''), '#8888aa');

    if v_voter_id is null or v_name is null or char_length(v_name) > 160 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select voter.* into v_voter
    from public.voters voter
    where voter.id = v_voter_id
      and voter.edition_id = p_edition_id
      and voter.show_id = p_show_id
    for update;

    if v_voter.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;

    update public.voters
    set name = v_name,
        flag_image = v_flag_image,
        accent_color = v_accent_color
    where id = v_voter_id;

    v_changed_count := case
      when v_voter.name is distinct from v_name
        or v_voter.flag_image is distinct from v_flag_image
        or v_voter.accent_color is distinct from v_accent_color
      then 1 else 0 end;

  elsif v_kind = 'reorder' then
    if jsonb_typeof(v_payload -> 'orderedVoterIds') <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    begin
      select array_agg(value::uuid order by ordinality)
      into v_requested_ids
      from jsonb_array_elements_text(v_payload -> 'orderedVoterIds')
        with ordinality as requested(value, ordinality);
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    select count(*)::integer, count(distinct value)::integer
    into v_order_count, v_distinct_order_count
    from jsonb_array_elements_text(v_payload -> 'orderedVoterIds') requested(value);

    select array_agg(voter.id order by voter.id)
    into v_roster_ids
    from public.voters voter
    where voter.edition_id = p_edition_id
      and voter.show_id = p_show_id;

    if v_order_count <> v_roster_count
       or v_distinct_order_count <> v_order_count
       or (select array_agg(id order by id) from unnest(v_requested_ids) id)
          is distinct from v_roster_ids then
      raise sqlstate 'PT409' using message = 'STATE_CHANGED';
    end if;

    with requested as (
      select value::uuid as voter_id, ordinality::integer as sort_order
      from jsonb_array_elements_text(v_payload -> 'orderedVoterIds')
        with ordinality as item(value, ordinality)
    )
    update public.voters voter
    set sort_order = requested.sort_order
    from requested
    where voter.id = requested.voter_id
      and voter.edition_id = p_edition_id
      and voter.show_id = p_show_id
      and voter.sort_order is distinct from requested.sort_order;

    get diagnostics v_changed_count = row_count;

  else
    begin
      v_voter_id := nullif(v_payload ->> 'voterId', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    if v_voter_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select voter.* into v_voter
    from public.voters voter
    where voter.id = v_voter_id
      and voter.edition_id = p_edition_id
      and voter.show_id = p_show_id
    for update;

    if v_voter.id is null then
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;

    v_dependencies := private.v3_jury_roster_voter_dependencies(
      p_edition_id,
      p_show_id,
      v_voter_id
    );

    if not private.v3_jury_roster_voter_removable(v_dependencies) then
      raise sqlstate 'PT409' using
        message = 'DEPENDENCY_FAILURE',
        detail = v_dependencies::text;
    end if;

    delete from public.voters
    where id = v_voter_id
      and edition_id = p_edition_id
      and show_id = p_show_id;

    if not found then
      raise sqlstate 'PT409' using message = 'STATE_CHANGED';
    end if;

    v_changed_count := 1;
  end if;

  select version_row.version
  into v_version
  from private.v3_jury_roster_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id;

  select count(*)::integer
  into v_roster_count
  from public.voters voter
  where voter.edition_id = p_edition_id
    and voter.show_id = p_show_id;

  v_after := jsonb_build_object(
    'version', v_version,
    'rosterCount', v_roster_count,
    'changedCount', v_changed_count
  );

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
    'v3_' || replace(v_command, '.', '_'),
    'voters',
    coalesce(v_voter_id::text, p_show_id::text),
    p_edition_id,
    v_before || jsonb_build_object('showId', p_show_id, 'reason', v_reason),
    v_after || jsonb_build_object(
      'showId', p_show_id,
      'voterId', v_voter_id,
      'dependencies', v_dependencies,
      'reason', v_reason,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'changeKind', v_kind,
    'voterId', v_voter_id,
    'createdCount', v_created_count,
    'changedCount', v_changed_count,
    'version', v_version,
    'rosterCount', v_roster_count,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return v_result || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_jury_roster_change(
  uuid, uuid, text, jsonb, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_roster_change(
  uuid, uuid, text, jsonb, text, uuid, text, bigint
) to authenticated, service_role;

-- Reuse the established Jury responsibility consequence channel. Roster
-- changes alter who is expected to provide a ballot, so task/readiness
-- reconciliation is the same downstream effect as the existing ballot-change
-- event. The payload identifies the completed roster fact explicitly.
create or replace function private.v3_emit_jury_roster_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_edition_id uuid;
  v_show_id uuid;
  v_version bigint;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not like 'jury.roster.%' then
    return new;
  end if;

  begin
    v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
    v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Jury roster operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_edition_id is null or v_show_id is null or v_version is null then
    raise exception 'Completed Jury roster operation lacks event provenance'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.shows show_row
    where show_row.id = v_show_id
      and show_row.edition_id = v_edition_id
  ) then
    raise exception 'Completed Jury roster operation is outside canonical show scope'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'jury.ballot_changed',
    'jury_roster',
    v_show_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'showId', v_show_id,
      'changeKind', new.scope ->> 'changeKind',
      'rosterChanged', true,
      'changedCount', new.result -> 'changedCount',
      'createdCount', new.result -> 'createdCount',
      'rosterCount', new.result -> 'rosterCount',
      'version', new.result -> 'version'
    ),
    1,
    array['jury.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_jury_roster_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_jury_roster_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_jury_roster_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_jury_roster_operation_event();

notify pgrst, 'reload schema';

commit;

begin;

-- System V3 / #588: make Organizer Jury roster mutation server-authoritative.
--
-- The legacy Organizer still writes public.voters during the staged cutover.
-- The version trigger therefore observes every legacy and V3 write, so a V3
-- review can never commit against a roster silently changed by another client.
select public.v3_register_migration_contract(
  'v3.s7.jury-roster-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-show Jury roster optimistic concurrency, authoritative preflight, idempotent governed mutations, evidence-preserving removal, audit and DomainEvent evidence while retaining legacy writers for staged consumer cutover.'
);

create table if not exists public.studio2_jury_roster_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_jury_roster_versions enable row level security;
revoke all on table public.studio2_jury_roster_versions from public, anon, authenticated;
grant all on table public.studio2_jury_roster_versions to service_role;

-- Existing show-scoped rosters begin at version 1. This does not rewrite any
-- voter row and only establishes a concurrency baseline for later commands.
insert into public.studio2_jury_roster_versions (show_id, edition_id, version, updated_at)
select voter.show_id, show_row.edition_id, 1, now()
from public.voters voter
join public.shows show_row on show_row.id = voter.show_id
where voter.show_id is not null
group by voter.show_id, show_row.edition_id
on conflict (show_id) do nothing;

create or replace function private.v3_touch_jury_roster_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_old_show_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.show_id else null end;
  v_new_show_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.show_id else null end;
  v_new_edition_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.edition_id else null end;
begin
  -- For DELETE, update only. A show cascade may already be removing its version
  -- row and must never be resurrected by the child-row delete trigger.
  if v_old_show_id is not null then
    update public.studio2_jury_roster_versions version_row
    set version = version_row.version + 1,
        updated_at = now()
    where version_row.show_id = v_old_show_id;
  end if;

  if v_new_show_id is not null
     and (tg_op = 'INSERT' or v_new_show_id is distinct from v_old_show_id) then
    insert into public.studio2_jury_roster_versions (show_id, edition_id, version, updated_at)
    values (v_new_show_id, v_new_edition_id, 1, now())
    on conflict (show_id) do update
    set edition_id = excluded.edition_id,
        version = public.studio2_jury_roster_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.v3_touch_jury_roster_version()
  from public, anon, authenticated;

create trigger v3_touch_jury_roster_version
after insert or update or delete on public.voters
for each row execute function private.v3_touch_jury_roster_version();

create or replace function private.v3_jury_roster_projection(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', voter.id,
        'editionId', voter.edition_id,
        'showId', voter.show_id,
        'countryId', voter.country_id,
        'contestEntityId', voter.contest_entity_id,
        'name', voter.name,
        'kind', voter.kind,
        'flagImage', voter.flag_image,
        'accentColor', voter.accent_color,
        'sortOrder', voter.sort_order
      )
      order by voter.sort_order, voter.name, voter.id
    ),
    '[]'::jsonb
  )
  from public.voters voter
  where voter.show_id = p_show_id
$projection$;

revoke all on function private.v3_jury_roster_projection(uuid)
  from public, anon, authenticated;

create or replace function private.v3_jury_roster_evidence(
  p_show_id uuid,
  p_voter_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $evidence$
declare
  v_voter public.voters%rowtype;
  v_vote_rows integer := 0;
  v_submission_rows integer := 0;
  v_dnv_rows integer := 0;
begin
  select voter.*
  into v_voter
  from public.voters voter
  where voter.id = p_voter_id
    and voter.show_id = p_show_id;

  if v_voter.id is null then
    raise exception using errcode = 'P0002', message = 'VOTER_NOT_FOUND';
  end if;

  -- Identity fallbacks deliberately err on the side of preserving evidence.
  -- A legacy row can predate voter_id linkage but still represent this exact
  -- country/entity in the same show.
  select count(*)::integer
  into v_vote_rows
  from public.jury_votes vote
  where vote.show_id = p_show_id
    and (
      vote.voter_id = v_voter.id
      or (
        vote.voter_id is null
        and v_voter.contest_entity_id is not null
        and vote.voter_entity_id = v_voter.contest_entity_id
      )
      or (
        vote.voter_id is null
        and v_voter.country_id is not null
        and vote.voter_country_id = v_voter.country_id
      )
    );

  select count(*)::integer
  into v_submission_rows
  from public.jury_ballot_submissions submission
  where submission.show_id = p_show_id
    and (
      submission.voter_id = v_voter.id
      or (
        submission.voter_id is null
        and v_voter.contest_entity_id is not null
        and submission.voter_entity_id = v_voter.contest_entity_id
      )
      or (
        submission.voter_id is null
        and v_voter.country_id is not null
        and submission.voter_country_id = v_voter.country_id
      )
    );

  select count(*)::integer
  into v_dnv_rows
  from public.jury_ballot_statuses status_row
  where status_row.show_id = p_show_id
    and (
      status_row.voter_id = v_voter.id
      or (
        status_row.voter_id is null
        and v_voter.contest_entity_id is not null
        and status_row.voter_entity_id = v_voter.contest_entity_id
      )
      or (
        status_row.voter_id is null
        and v_voter.country_id is not null
        and status_row.voter_country_id = v_voter.country_id
      )
    );

  return jsonb_build_object(
    'voterId', v_voter.id,
    'savedVoteRows', v_vote_rows,
    'ballotSubmissions', v_submission_rows,
    'dnvRows', v_dnv_rows,
    'hasEvidence', (v_vote_rows + v_submission_rows + v_dnv_rows) > 0
  );
end
$evidence$;

revoke all on function private.v3_jury_roster_evidence(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_jury_roster_preview_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_voter_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_show public.shows%rowtype;
  v_version bigint := 0;
  v_evidence jsonb := null;
  v_missing integer := 0;
  v_roster_count integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or v_action not in ('materialize', 'add', 'edit', 'reorder', 'remove')
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  insert into public.studio2_jury_roster_versions (show_id, edition_id, version, updated_at)
  values (p_show_id, p_edition_id, 0, now())
  on conflict (show_id) do nothing;

  select version_row.version
  into v_version
  from public.studio2_jury_roster_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id;

  if v_version is null then
    raise exception using errcode = '23514', message = 'ROSTER_SCOPE_MISMATCH';
  end if;

  select count(*)::integer
  into v_roster_count
  from public.voters voter
  where voter.show_id = p_show_id
    and voter.edition_id = p_edition_id;

  if v_action in ('edit', 'remove') then
    if p_voter_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if not exists (
      select 1
      from public.voters voter
      where voter.id = p_voter_id
        and voter.show_id = p_show_id
        and voter.edition_id = p_edition_id
    ) then
      raise exception using errcode = 'P0002', message = 'VOTER_NOT_FOUND';
    end if;
  end if;

  if v_action = 'remove' then
    v_evidence := private.v3_jury_roster_evidence(p_show_id, p_voter_id);
  end if;

  if v_action = 'materialize' then
    select count(*)::integer
    into v_missing
    from (
      select distinct on (
        case
          when participant.country_id is not null then 'country:' || participant.country_id::text
          else 'entity:' || participant.contest_entity_id::text
        end
      )
        participant.country_id,
        participant.contest_entity_id,
        participant.running_order,
        participant.id
      from public.participants participant
      where participant.show_id = p_show_id
        and participant.edition_id = p_edition_id
        and participant.participation_status = 'confirmed'
        and (participant.country_id is not null or participant.contest_entity_id is not null)
      order by
        case
          when participant.country_id is not null then 'country:' || participant.country_id::text
          else 'entity:' || participant.contest_entity_id::text
        end,
        participant.running_order nulls last,
        participant.id
    ) candidate
    where not exists (
      select 1
      from public.voters voter
      where voter.show_id = p_show_id
        and voter.edition_id = p_edition_id
        and (
          (candidate.country_id is not null and voter.country_id = candidate.country_id)
          or (
            candidate.contest_entity_id is not null
            and voter.contest_entity_id = candidate.contest_entity_id
          )
        )
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'voterId', p_voter_id,
    'expectedVersion', v_version,
    'rosterCount', v_roster_count,
    'missingParticipants', v_missing,
    'evidence', v_evidence,
    'blocked', coalesce((v_evidence ->> 'hasEvidence')::boolean, false),
    'roster', private.v3_jury_roster_projection(p_show_id),
    'serverTime', clock_timestamp()
  );
end
$preview$;

revoke all on function public.studio2_jury_roster_preview_v3(
  uuid, uuid, text, uuid, jsonb
) from public, anon;
grant execute on function public.studio2_jury_roster_preview_v3(
  uuid, uuid, text, uuid, jsonb
) to authenticated, service_role;

create or replace function public.studio2_apply_jury_roster_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_voter_id uuid,
  p_payload jsonb,
  p_reason text,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_before_count integer := 0;
  v_after_count integer := 0;
  v_affected integer := 0;
  v_voter public.voters%rowtype;
  v_country_id uuid;
  v_entity_id uuid;
  v_name text;
  v_kind text;
  v_flag_image text;
  v_accent_color text;
  v_evidence jsonb := null;
  v_requested_count integer := 0;
  v_distinct_count integer := 0;
  v_matched_count integer := 0;
  v_max_sort integer := 0;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or p_operation_id is null
     or p_expected_version is null or p_expected_version < 0
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_action not in ('materialize', 'add', 'edit', 'reorder', 'remove')
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_reason is not null and length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action = 'remove' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_command := 'jury.roster.' || v_action;

  -- Claim before mutable-version validation. If the first committed response is
  -- lost, an exact retry returns the existing operation instead of seeing the
  -- advanced roster version as a fresh conflict.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'voterId', p_voter_id,
      'expectedVersion', p_expected_version
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'action', v_action,
      'voterId', p_voter_id,
      'payload', coalesce(p_payload, '{}'::jsonb),
      'reason', v_reason,
      'expectedVersion', p_expected_version
    ))
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v3-jury-roster:' || p_show_id::text, 0));

  insert into public.studio2_jury_roster_versions (show_id, edition_id, version, updated_at)
  values (p_show_id, p_edition_id, 0, now())
  on conflict (show_id) do nothing;

  select version_row.version
  into v_current_version
  from public.studio2_jury_roster_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id
  for update;

  if v_current_version is null then
    raise exception using errcode = '23514', message = 'ROSTER_SCOPE_MISMATCH';
  end if;
  if p_expected_version <> v_current_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      hint = 'The Jury roster changed after review. Reload the authoritative roster and review the operation again.';
  end if;

  select count(*)::integer
  into v_before_count
  from public.voters voter
  where voter.show_id = p_show_id
    and voter.edition_id = p_edition_id;

  if v_action = 'materialize' then
    select coalesce(max(voter.sort_order), 0)
    into v_max_sort
    from public.voters voter
    where voter.show_id = p_show_id
      and voter.edition_id = p_edition_id;

    with candidates as (
      select distinct on (
        case
          when participant.country_id is not null then 'country:' || participant.country_id::text
          else 'entity:' || participant.contest_entity_id::text
        end
      )
        participant.id,
        participant.country_id,
        participant.contest_entity_id,
        participant.running_order,
        coalesce(entity_row.display_name, country.name, 'Country') as display_name,
        coalesce(entity_row.flag_image, country.flag_image) as flag_image,
        coalesce(country.accent_color, '#8888aa') as accent_color
      from public.participants participant
      left join public.contest_entities entity_row
        on entity_row.id = participant.contest_entity_id
       and entity_row.edition_id = p_edition_id
      left join public.countries country
        on country.id = participant.country_id
      where participant.show_id = p_show_id
        and participant.edition_id = p_edition_id
        and participant.participation_status = 'confirmed'
        and (participant.country_id is not null or participant.contest_entity_id is not null)
      order by
        case
          when participant.country_id is not null then 'country:' || participant.country_id::text
          else 'entity:' || participant.contest_entity_id::text
        end,
        participant.running_order nulls last,
        participant.id
    ), missing as (
      select candidate.*,
             row_number() over (
               order by candidate.running_order nulls last, candidate.display_name, candidate.id
             )::integer as new_position
      from candidates candidate
      where not exists (
        select 1
        from public.voters voter
        where voter.show_id = p_show_id
          and voter.edition_id = p_edition_id
          and (
            (candidate.country_id is not null and voter.country_id = candidate.country_id)
            or (
              candidate.contest_entity_id is not null
              and voter.contest_entity_id = candidate.contest_entity_id
            )
          )
      )
    )
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
      missing.country_id,
      missing.contest_entity_id,
      missing.display_name,
      case when missing.country_id is not null then 'country' else 'custom' end,
      missing.flag_image,
      missing.accent_color,
      v_max_sort + missing.new_position
    from missing;

    get diagnostics v_affected = row_count;

  elsif v_action = 'add' then
    begin
      v_country_id := nullif(btrim(coalesce(p_payload ->> 'countryId', '')), '')::uuid;
      v_entity_id := nullif(btrim(coalesce(p_payload ->> 'contestEntityId', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    v_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
    v_kind := lower(btrim(coalesce(p_payload ->> 'kind', '')));
    v_flag_image := nullif(btrim(coalesce(p_payload ->> 'flagImage', '')), '');
    v_accent_color := coalesce(nullif(btrim(coalesce(p_payload ->> 'accentColor', '')), ''), '#8888aa');

    if v_name is null or length(v_name) > 160
       or v_kind not in ('country', 'external-country', 'organization', 'person', 'custom')
       or (v_kind = 'country' and v_country_id is null)
       or length(coalesce(v_flag_image, '')) > 2000
       or length(v_accent_color) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    if v_country_id is not null
       and not exists (select 1 from public.countries country where country.id = v_country_id) then
      raise exception using errcode = '22023', message = 'INVALID_COUNTRY';
    end if;

    if v_entity_id is not null then
      if not exists (
        select 1
        from public.contest_entities entity_row
        where entity_row.id = v_entity_id
          and entity_row.edition_id = p_edition_id
          and (v_country_id is null or entity_row.country_id is not distinct from v_country_id)
      ) then
        raise exception using errcode = '22023', message = 'INVALID_CONTEST_ENTITY';
      end if;
    end if;

    if (v_country_id is not null or v_entity_id is not null) and exists (
      select 1
      from public.voters voter
      where voter.show_id = p_show_id
        and voter.edition_id = p_edition_id
        and (
          (v_country_id is not null and voter.country_id = v_country_id)
          or (v_entity_id is not null and voter.contest_entity_id = v_entity_id)
        )
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_ROSTER_IDENTITY';
    end if;

    select coalesce(max(voter.sort_order), 0) + 1
    into v_max_sort
    from public.voters voter
    where voter.show_id = p_show_id
      and voter.edition_id = p_edition_id;

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
      v_kind,
      v_flag_image,
      v_accent_color,
      v_max_sort
    )
    returning * into v_voter;

    p_voter_id := v_voter.id;
    v_affected := 1;

  elsif v_action = 'edit' then
    if p_voter_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select voter.*
    into v_voter
    from public.voters voter
    where voter.id = p_voter_id
      and voter.show_id = p_show_id
      and voter.edition_id = p_edition_id
    for update;

    if v_voter.id is null then
      raise exception using errcode = 'P0002', message = 'VOTER_NOT_FOUND';
    end if;

    v_name := case
      when p_payload ? 'name' then nullif(btrim(coalesce(p_payload ->> 'name', '')), '')
      else v_voter.name
    end;
    v_flag_image := case
      when p_payload ? 'flagImage' then nullif(btrim(coalesce(p_payload ->> 'flagImage', '')), '')
      else v_voter.flag_image
    end;
    v_accent_color := case
      when p_payload ? 'accentColor' then coalesce(nullif(btrim(coalesce(p_payload ->> 'accentColor', '')), ''), '#8888aa')
      else v_voter.accent_color
    end;

    if v_name is null or length(v_name) > 160
       or length(coalesce(v_flag_image, '')) > 2000
       or length(v_accent_color) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update public.voters voter
    set name = v_name,
        flag_image = v_flag_image,
        accent_color = v_accent_color
    where voter.id = v_voter.id;

    v_country_id := v_voter.country_id;
    v_affected := 1;

  elsif v_action = 'reorder' then
    if jsonb_typeof(p_payload -> 'voterIds') <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    v_requested_count := jsonb_array_length(p_payload -> 'voterIds');
    if v_requested_count <> v_before_count then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    begin
      select count(distinct desired.value::uuid)::integer,
             count(voter.id)::integer
      into v_distinct_count, v_matched_count
      from jsonb_array_elements_text(p_payload -> 'voterIds') desired(value)
      left join public.voters voter
        on voter.id = desired.value::uuid
       and voter.show_id = p_show_id
       and voter.edition_id = p_edition_id;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    if v_distinct_count <> v_requested_count or v_matched_count <> v_requested_count then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    with desired as (
      select desired.value::uuid as voter_id,
             desired.ordinality::integer as sort_order
      from jsonb_array_elements_text(p_payload -> 'voterIds')
        with ordinality as desired(value, ordinality)
    )
    update public.voters voter
    set sort_order = desired.sort_order
    from desired
    where voter.id = desired.voter_id
      and voter.show_id = p_show_id
      and voter.edition_id = p_edition_id;

    get diagnostics v_affected = row_count;

  else
    if p_voter_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select voter.*
    into v_voter
    from public.voters voter
    where voter.id = p_voter_id
      and voter.show_id = p_show_id
      and voter.edition_id = p_edition_id
    for update;

    if v_voter.id is null then
      raise exception using errcode = 'P0002', message = 'VOTER_NOT_FOUND';
    end if;

    v_evidence := private.v3_jury_roster_evidence(p_show_id, p_voter_id);
    if coalesce((v_evidence ->> 'hasEvidence')::boolean, false) then
      raise exception using
        errcode = '23514',
        message = 'EVIDENCE_EXISTS',
        hint = 'This Jury identity has saved scores, ballot submissions or did-not-vote evidence. Preserve the roster identity and resolve the official evidence through its governed lifecycle instead.';
    end if;

    v_country_id := v_voter.country_id;
    delete from public.voters voter
    where voter.id = v_voter.id
      and voter.show_id = p_show_id
      and voter.edition_id = p_edition_id;
    get diagnostics v_affected = row_count;
  end if;

  select version_row.version
  into v_next_version
  from public.studio2_jury_roster_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id;

  if v_next_version is null or v_next_version < v_current_version then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  select count(*)::integer
  into v_after_count
  from public.voters voter
  where voter.show_id = p_show_id
    and voter.edition_id = p_edition_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    country_id,
    before_data,
    after_data
  ) values (
    v_actor,
    v_command,
    'voters',
    p_show_id::text,
    p_edition_id,
    v_country_id,
    jsonb_strip_nulls(jsonb_build_object(
      'showId', p_show_id,
      'voterId', p_voter_id,
      'version', v_current_version,
      'rosterCount', v_before_count,
      'evidence', v_evidence
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'operationId', v_operation_id,
      'showId', p_show_id,
      'voterId', p_voter_id,
      'action', v_action,
      'reason', v_reason,
      'version', v_next_version,
      'rosterCount', v_after_count,
      'affectedCount', v_affected
    ))
  );

  perform private.v3_emit_domain_event(
    'jury.roster_changed',
    'jury_roster',
    p_show_id::text,
    v_next_version,
    v_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'showId', p_show_id,
      'voterId', p_voter_id,
      'action', v_action,
      'previousVersion', v_current_version,
      'version', v_next_version,
      'rosterCount', v_after_count,
      'affectedCount', v_affected
    )),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'action', v_action,
    'voterId', p_voter_id,
    'previousVersion', v_current_version,
    'version', v_next_version,
    'affectedCount', v_affected,
    'rosterCount', v_after_count,
    'roster', private.v3_jury_roster_projection(p_show_id),
    'serverTime', clock_timestamp()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_jury_roster_v3(
  uuid, uuid, text, uuid, jsonb, text, bigint, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_apply_jury_roster_v3(
  uuid, uuid, text, uuid, jsonb, text, bigint, uuid, text, uuid
) to authenticated, service_role;

comment on function public.studio2_jury_roster_preview_v3(uuid, uuid, text, uuid, jsonb) is
  'Authoritative exact-show V3 Jury roster preflight. Returns current roster version and evidence counts for destructive removal.';
comment on function public.studio2_apply_jury_roster_v3(uuid, uuid, text, uuid, jsonb, text, bigint, uuid, text, uuid) is
  'Governed V3 Jury roster command family. Exact edition/show scope, optimistic versioning, semantic idempotency, atomic materialize/reorder, evidence-preserving removal, audit and jury.roster_changed DomainEvent.';

notify pgrst, 'reload schema';

commit;

begin;

-- V3 System / #674: make show.voting_config an explicitly versioned official
-- configuration without creating a second scoring source of truth. Existing
-- readers continue to consume shows.voting_config while every change receives
-- immutable version/history evidence and consequential changes fail closed.
select public.v3_register_migration_contract(
  '20261019231500_v3_versioned_voting_config',
  1,
  'forward_fix_only',
  false,
  null,
  'Versioned exact-show VotingConfig projection, consequence preflight and idempotent Organizer command with result-version binding'
);

create table if not exists private.v3_voting_config_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists private.v3_voting_config_history (
  show_id uuid not null references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null check (version >= 1),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  changed_at timestamptz not null default now(),
  changed_by uuid,
  operation_id uuid,
  reason text,
  primary key (show_id, version)
);

create index if not exists v3_voting_config_history_edition_idx
  on private.v3_voting_config_history (edition_id, changed_at desc);

revoke all on table private.v3_voting_config_versions from public, anon, authenticated;
revoke all on table private.v3_voting_config_history from public, anon, authenticated;
grant select on table private.v3_voting_config_versions to service_role;
grant select on table private.v3_voting_config_history to service_role;

create or replace function private.v3_assert_voting_config_shape(p_config jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate$
declare
  v_value jsonb;
  v_text text;
  v_number numeric;
  v_seen text[] := '{}'::text[];
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_config ? 'juryEnabled' and jsonb_typeof(p_config -> 'juryEnabled') <> 'boolean' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_config ? 'televoteEnabled' and jsonb_typeof(p_config -> 'televoteEnabled') <> 'boolean' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_config ? 'weightedScoring' and jsonb_typeof(p_config -> 'weightedScoring') <> 'boolean' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_config ? 'allowSelfVote' and jsonb_typeof(p_config -> 'allowSelfVote') <> 'boolean' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_config ? 'televoteMode'
     and coalesce(p_config ->> 'televoteMode', '') not in ('scale', 'total') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_config ? 'juryPoints' then
    if jsonb_typeof(p_config -> 'juryPoints') <> 'array'
       or jsonb_array_length(p_config -> 'juryPoints') = 0
       or jsonb_array_length(p_config -> 'juryPoints') > 50 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_seen := '{}'::text[];
    for v_value in select value from jsonb_array_elements(p_config -> 'juryPoints') loop
      if jsonb_typeof(v_value) <> 'number' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_number := (v_value #>> '{}')::numeric;
      if v_number <= 0 or trunc(v_number) <> v_number or v_number > 100000 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      if v_number::text = any(v_seen) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_seen := array_append(v_seen, v_number::text);
    end loop;
  end if;

  if p_config ? 'televotePoints' then
    if jsonb_typeof(p_config -> 'televotePoints') <> 'array'
       or jsonb_array_length(p_config -> 'televotePoints') = 0
       or jsonb_array_length(p_config -> 'televotePoints') > 50 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_seen := '{}'::text[];
    for v_value in select value from jsonb_array_elements(p_config -> 'televotePoints') loop
      if jsonb_typeof(v_value) <> 'number' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_number := (v_value #>> '{}')::numeric;
      if v_number <= 0 or trunc(v_number) <> v_number or v_number > 100000 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      if v_number::text = any(v_seen) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_seen := array_append(v_seen, v_number::text);
    end loop;
  end if;

  if p_config ? 'weighting' then
    if jsonb_typeof(p_config -> 'weighting') <> 'object' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if (p_config -> 'weighting') ? 'jury' then
      begin
        v_number := (p_config -> 'weighting' ->> 'jury')::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end;
      if v_number < 0 or v_number > 100 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    end if;
    if (p_config -> 'weighting') ? 'televote' then
      begin
        v_number := (p_config -> 'weighting' ->> 'televote')::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end;
      if v_number < 0 or v_number > 100 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    end if;
    if (p_config -> 'weighting') ? 'jury' and (p_config -> 'weighting') ? 'televote'
       and abs(
         (p_config -> 'weighting' ->> 'jury')::numeric
         + (p_config -> 'weighting' ->> 'televote')::numeric
         - 100
       ) > 0.0001 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end if;

  if p_config ? 'tieBreak' then
    if jsonb_typeof(p_config -> 'tieBreak') <> 'array'
       or jsonb_array_length(p_config -> 'tieBreak') = 0
       or jsonb_array_length(p_config -> 'tieBreak') > 5 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_seen := '{}'::text[];
    for v_value in select value from jsonb_array_elements(p_config -> 'tieBreak') loop
      if jsonb_typeof(v_value) <> 'string' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_text := v_value #>> '{}';
      if v_text not in ('televote', 'jury', 'twelves', 'countback', 'runningOrder')
         or v_text = any(v_seen) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_seen := array_append(v_seen, v_text);
    end loop;
  end if;

  if p_config ? 'qualifiers' and jsonb_typeof(p_config -> 'qualifiers') <> 'null' then
    if jsonb_typeof(p_config -> 'qualifiers') <> 'number' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_number := (p_config ->> 'qualifiers')::numeric;
    if v_number < 0 or trunc(v_number) <> v_number or v_number > 1000 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  end if;

  if p_config ? 'votingOrder' then
    if jsonb_typeof(p_config -> 'votingOrder') <> 'array'
       or jsonb_array_length(p_config -> 'votingOrder') > 500 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    for v_value in select value from jsonb_array_elements(p_config -> 'votingOrder') loop
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 160 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    end loop;
  end if;
end
$validate$;

create or replace function private.v3_voting_config_evidence(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $evidence$
  select jsonb_build_object(
    'juryWindowStatus', coalesce((
      select window.status
      from public.jury_voting_windows window
      where window.edition_id = p_edition_id and window.show_id = p_show_id
    ), 'not_started'),
    'juryScoreRows', (
      select count(*) from public.jury_votes vote
      where vote.edition_id = p_edition_id and vote.show_id = p_show_id
    ),
    'juryBallotSubmissions', (
      select count(*) from public.jury_ballot_submissions ballot
      where ballot.edition_id = p_edition_id and ballot.show_id = p_show_id
    ),
    'juryBallotStatuses', (
      select count(*) from public.jury_ballot_statuses status_row
      where status_row.edition_id = p_edition_id and status_row.show_id = p_show_id
    ),
    'televoteRows', (
      select count(*) from public.televote_votes vote
      where vote.edition_id = p_edition_id and vote.show_id = p_show_id
    ),
    'televoteContributionRows', (
      select count(*) from public.public_televote_country_contributions contribution
      where contribution.show_id = p_show_id
    ),
    'televoteFrozenBindings', (
      select count(*) from public.televoting_round_bindings binding
      where binding.edition_id = p_edition_id
        and binding.show_id = p_show_id
        and binding.frozen_at is not null
    ),
    'resultCalculationVersion', coalesce((
      select operation.calculation_version
      from public.studio2_result_operations operation
      where operation.edition_id = p_edition_id and operation.show_id = p_show_id
    ), 0),
    'resultReviewedVersion', (
      select operation.reviewed_version
      from public.studio2_result_operations operation
      where operation.edition_id = p_edition_id and operation.show_id = p_show_id
    ),
    'resultLockedVersion', (
      select operation.locked_version
      from public.studio2_result_operations operation
      where operation.edition_id = p_edition_id and operation.show_id = p_show_id
    ),
    'resultRevealReadyVersion', (
      select operation.reveal_ready_version
      from public.studio2_result_operations operation
      where operation.edition_id = p_edition_id and operation.show_id = p_show_id
    )
  )
$evidence$;

create or replace function private.v3_voting_config_change_blocked(p_evidence jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $blocked$
  select
    coalesce(p_evidence ->> 'juryWindowStatus', 'not_started') not in ('not_started', 'upcoming', 'locked')
    or coalesce((p_evidence ->> 'juryScoreRows')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'juryBallotSubmissions')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'juryBallotStatuses')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'televoteRows')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'televoteContributionRows')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'televoteFrozenBindings')::bigint, 0) > 0
    or coalesce((p_evidence ->> 'resultCalculationVersion')::bigint, 0) > 0
    or (p_evidence ->> 'resultReviewedVersion') is not null
    or (p_evidence ->> 'resultLockedVersion') is not null
    or (p_evidence ->> 'resultRevealReadyVersion') is not null
$blocked$;

create or replace function private.v3_assert_voting_config_change_allowed(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $assert$
declare
  v_evidence jsonb;
begin
  v_evidence := private.v3_voting_config_evidence(p_edition_id, p_show_id);
  if private.v3_voting_config_change_blocked(v_evidence) then
    raise sqlstate 'PT409' using
      message = 'DEPENDENCY_FAILURE',
      detail = v_evidence::text,
      hint = 'Voting configuration is frozen after official voting or result evidence exists.';
  end if;
  return v_evidence;
end
$assert$;

-- Bootstrap exact version 1 for every existing show without changing its
-- current configuration. This is small metadata/history, not a data rewrite.
insert into private.v3_voting_config_versions (show_id, edition_id, version, updated_at)
select show_row.id, show_row.edition_id, 1, coalesce(show_row.updated_at, now())
from public.shows show_row
on conflict (show_id) do nothing;

insert into private.v3_voting_config_history (
  show_id, edition_id, version, config, changed_at, changed_by, reason
)
select
  show_row.id,
  show_row.edition_id,
  1,
  coalesce(show_row.voting_config, '{}'::jsonb),
  coalesce(show_row.updated_at, now()),
  null,
  'V3 version baseline'
from public.shows show_row
on conflict (show_id, version) do nothing;

create or replace function private.v3_guard_voting_config_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if tg_op = 'INSERT' then
    perform private.v3_assert_voting_config_shape(coalesce(new.voting_config, '{}'::jsonb));
    return new;
  end if;

  if old.voting_config is distinct from new.voting_config then
    perform private.v3_assert_voting_config_shape(coalesce(new.voting_config, '{}'::jsonb));
    perform private.v3_assert_voting_config_change_allowed(new.edition_id, new.id);
  end if;
  return new;
end
$guard$;

create or replace function private.v3_record_voting_config_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $record$
declare
  v_version bigint;
  v_operation_id uuid;
  v_reason text := nullif(current_setting('v3.voting_config_reason', true), '');
begin
  if tg_op = 'UPDATE' and old.voting_config is not distinct from new.voting_config then
    return new;
  end if;

  begin
    v_operation_id := nullif(current_setting('v3.voting_config_operation_id', true), '')::uuid;
  exception when invalid_text_representation then
    v_operation_id := null;
  end;

  if tg_op = 'INSERT' then
    insert into private.v3_voting_config_versions (show_id, edition_id, version, updated_at)
    values (new.id, new.edition_id, 1, now())
    on conflict (show_id) do nothing;
    v_version := 1;
  else
    insert into private.v3_voting_config_versions (show_id, edition_id, version, updated_at)
    values (new.id, new.edition_id, 2, now())
    on conflict (show_id)
    do update set
      edition_id = excluded.edition_id,
      version = private.v3_voting_config_versions.version + 1,
      updated_at = now()
    returning version into v_version;
  end if;

  insert into private.v3_voting_config_history (
    show_id,
    edition_id,
    version,
    config,
    changed_at,
    changed_by,
    operation_id,
    reason
  ) values (
    new.id,
    new.edition_id,
    v_version,
    coalesce(new.voting_config, '{}'::jsonb),
    now(),
    auth.uid(),
    v_operation_id,
    v_reason
  )
  on conflict (show_id, version) do nothing;

  return new;
end
$record$;

revoke all on function private.v3_assert_voting_config_shape(jsonb) from public, anon, authenticated;
revoke all on function private.v3_voting_config_evidence(uuid, uuid) from public, anon, authenticated;
revoke all on function private.v3_voting_config_change_blocked(jsonb) from public, anon, authenticated;
revoke all on function private.v3_assert_voting_config_change_allowed(uuid, uuid) from public, anon, authenticated;
revoke all on function private.v3_guard_voting_config_write() from public, anon, authenticated;
revoke all on function private.v3_record_voting_config_version() from public, anon, authenticated;

drop trigger if exists v3_guard_voting_config_write on public.shows;
create trigger v3_guard_voting_config_write
before insert or update of voting_config on public.shows
for each row execute function private.v3_guard_voting_config_write();

drop trigger if exists v3_record_voting_config_version on public.shows;
create trigger v3_record_voting_config_version
after insert or update of voting_config on public.shows
for each row execute function private.v3_record_voting_config_version();

-- Bind every official calculation pointer to the exact VotingConfig version it
-- used. The result operation itself remains the Results lifecycle authority.
alter table public.studio2_result_operations
  add column if not exists voting_config_version bigint;

update public.studio2_result_operations operation
set voting_config_version = version_row.version
from private.v3_voting_config_versions version_row
where version_row.show_id = operation.show_id
  and version_row.edition_id = operation.edition_id
  and operation.calculation_version > 0
  and operation.voting_config_version is null;

create or replace function private.v3_bind_result_operation_voting_config_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bind$
begin
  if new.calculation_version > 0
     and (
       tg_op = 'INSERT'
       or old.calculation_version is distinct from new.calculation_version
       or new.voting_config_version is null
     ) then
    select version_row.version
    into new.voting_config_version
    from private.v3_voting_config_versions version_row
    where version_row.show_id = new.show_id
      and version_row.edition_id = new.edition_id;

    if new.voting_config_version is null then
      raise exception 'Result calculation cannot bind a VotingConfig version'
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$bind$;

revoke all on function private.v3_bind_result_operation_voting_config_version()
  from public, anon, authenticated;

drop trigger if exists v3_bind_result_operation_voting_config_version
  on public.studio2_result_operations;
create trigger v3_bind_result_operation_voting_config_version
before insert or update of calculation_version
on public.studio2_result_operations
for each row execute function private.v3_bind_result_operation_voting_config_version();

create or replace function public.studio2_voting_config_snapshot(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_show public.shows;
  v_config jsonb;
  v_version bigint;
  v_evidence jsonb;
  v_jury_weight numeric;
  v_televote_weight numeric;
  v_points text;
  v_tie text;
begin
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select show_row.* into v_show
  from public.shows show_row
  where show_row.id = p_show_id and show_row.edition_id = p_edition_id;
  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  v_config := coalesce(v_show.voting_config, '{}'::jsonb);
  perform private.v3_assert_voting_config_shape(v_config);
  select version_row.version into v_version
  from private.v3_voting_config_versions version_row
  where version_row.show_id = p_show_id and version_row.edition_id = p_edition_id;
  v_version := coalesce(v_version, 1);
  v_evidence := private.v3_voting_config_evidence(p_edition_id, p_show_id);

  v_jury_weight := coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50);
  v_televote_weight := coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50);
  select coalesce(string_agg(value, ', ' order by ordinality), '12, 10, 8, 7, 6, 5, 4, 3, 2, 1')
  into v_points
  from jsonb_array_elements_text(coalesce(v_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb))
    with ordinality as point(value, ordinality);
  select coalesce(string_agg(value, ' → ' order by ordinality), 'televote → twelves → jury')
  into v_tie
  from jsonb_array_elements_text(coalesce(v_config -> 'tieBreak', '["televote","twelves","jury"]'::jsonb))
    with ordinality as rule(value, ordinality);

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'version', v_version,
    'config', v_config,
    'summary', jsonb_build_object(
      'jury', 'Jury ' || trim(to_char(v_jury_weight, 'FM999990D99')) || '%',
      'public', 'Public ' || trim(to_char(v_televote_weight, 'FM999990D99')) || '%',
      'points', 'Points ' || v_points,
      'tieBreak', 'Tie: ' || v_tie,
      'ownCountry', case
        when coalesce((v_config ->> 'allowSelfVote')::boolean, false) then 'Own-country voting allowed'
        else 'Own-country voting prohibited'
      end
    ),
    'evidence', v_evidence,
    'changeBlocked', private.v3_voting_config_change_blocked(v_evidence),
    'resultConfigVersion', (
      select operation.voting_config_version
      from public.studio2_result_operations operation
      where operation.edition_id = p_edition_id and operation.show_id = p_show_id
    ),
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function public.studio2_voting_config_snapshot(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_voting_config_snapshot(uuid, uuid)
  to authenticated, service_role;

create or replace function public.studio2_voting_config_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_proposed_config jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_evidence jsonb;
  v_changed boolean;
  v_blocked boolean;
  v_risk text;
begin
  perform private.v3_assert_voting_config_shape(p_proposed_config);
  v_snapshot := public.studio2_voting_config_snapshot(p_edition_id, p_show_id);
  v_evidence := v_snapshot -> 'evidence';
  v_changed := (v_snapshot -> 'config') is distinct from p_proposed_config;
  v_blocked := v_changed and private.v3_voting_config_change_blocked(v_evidence);
  v_risk := case
    when not v_changed then 'R1'
    when v_blocked then 'blocked'
    when coalesce(v_evidence ->> 'juryWindowStatus', 'not_started') <> 'not_started' then 'R3'
    else 'R2'
  end;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'showId', p_show_id,
    'expectedVersion', v_snapshot -> 'version',
    'changed', v_changed,
    'blocked', v_blocked,
    'riskClass', v_risk,
    'reasonRequired', v_risk in ('R3', 'R4'),
    'recalculationRequired', coalesce((v_evidence ->> 'resultCalculationVersion')::bigint, 0) > 0,
    'evidence', v_evidence,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.studio2_voting_config_preflight(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.studio2_voting_config_preflight(uuid, uuid, jsonb)
  to authenticated, service_role;

create or replace function public.studio2_apply_voting_config_change(
  p_edition_id uuid,
  p_show_id uuid,
  p_proposed_config jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_show public.shows;
  v_version bigint;
  v_evidence jsonb;
  v_changed boolean;
  v_result jsonb;
begin
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or p_expected_version is null or p_expected_version < 1
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('voting.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  perform private.v3_assert_voting_config_shape(p_proposed_config);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'voting.config.update',
    'R2',
    jsonb_build_object('editionId', p_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'config', p_proposed_config,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb) || jsonb_build_object('replayed', true);
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

  select show_row.* into v_show
  from public.shows show_row
  where show_row.id = p_show_id and show_row.edition_id = p_edition_id
  for update;
  if v_show.id is null then
    raise sqlstate 'PT409' using message = 'STATE_CHANGED';
  end if;

  select version_row.version into v_version
  from private.v3_voting_config_versions version_row
  where version_row.show_id = p_show_id and version_row.edition_id = p_edition_id
  for update;
  v_version := coalesce(v_version, 1);
  if v_version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  v_changed := coalesce(v_show.voting_config, '{}'::jsonb) is distinct from p_proposed_config;
  if v_changed then
    v_evidence := private.v3_assert_voting_config_change_allowed(p_edition_id, p_show_id);
    perform set_config('v3.voting_config_operation_id', v_operation_id::text, true);
    perform set_config('v3.voting_config_reason', coalesce(v_reason, ''), true);

    update public.shows
    set voting_config = p_proposed_config,
        qualifier_count = case
          when p_proposed_config ? 'qualifiers'
               and jsonb_typeof(p_proposed_config -> 'qualifiers') = 'number'
            then (p_proposed_config ->> 'qualifiers')::integer
          else qualifier_count
        end,
        updated_at = now()
    where id = p_show_id and edition_id = p_edition_id;

    select version_row.version into v_version
    from private.v3_voting_config_versions version_row
    where version_row.show_id = p_show_id and version_row.edition_id = p_edition_id;
  else
    v_evidence := private.v3_voting_config_evidence(p_edition_id, p_show_id);
  end if;

  insert into public.admin_audit_log (
    actor_id, action, table_name, record_id, edition_id, before_data, after_data
  ) values (
    auth.uid(),
    'v3_voting_config_update',
    'shows',
    p_show_id::text,
    p_edition_id,
    jsonb_build_object(
      'version', p_expected_version,
      'config', coalesce(v_show.voting_config, '{}'::jsonb),
      'operationId', v_operation_id,
      'reason', v_reason
    ),
    jsonb_build_object(
      'version', v_version,
      'config', p_proposed_config,
      'changed', v_changed,
      'operationId', v_operation_id,
      'reason', v_reason
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'changed', v_changed,
    'version', v_version,
    'config', p_proposed_config,
    'evidence', v_evidence,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_voting_config_change(
  uuid, uuid, jsonb, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_voting_config_change(
  uuid, uuid, jsonb, text, uuid, text, bigint
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

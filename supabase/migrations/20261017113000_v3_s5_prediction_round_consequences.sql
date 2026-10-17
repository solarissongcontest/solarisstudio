begin;

-- System V3 S5: canonical Prediction round configuration/write boundary.
-- Round configuration currently has one browser writer. Move create/update/delete
-- behind versioned operation RPCs, preserve existing read/RLS behaviour, and emit
-- prediction.changed only for completed semantic mutations.

create table if not exists public.studio2_prediction_round_versions (
  round_id uuid primary key references public.prediction_rounds(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into public.studio2_prediction_round_versions (round_id, version, updated_at)
select round_row.id, 1, now()
from public.prediction_rounds round_row
on conflict (round_id) do nothing;

alter table public.studio2_prediction_round_versions enable row level security;
revoke all on table public.studio2_prediction_round_versions from public, anon, authenticated;
grant all on table public.studio2_prediction_round_versions to service_role;

create or replace function private.v3_prediction_types_canonical(p_types text[])
returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog
as $canonical$
  select coalesce(array_agg(distinct item order by item), array[]::text[])
  from unnest(coalesce(p_types, array[]::text[])) item
$canonical$;

revoke all on function private.v3_prediction_types_canonical(text[])
  from public, anon, authenticated;

create or replace function public.studio2_prediction_round_config_preview(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_show public.shows%rowtype;
  v_round public.prediction_rounds%rowtype;
  v_version bigint := 0;
begin
  if p_show_id is null then
    raise exception 'Show is required' using errcode = '22023';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select * into v_round
  from public.prediction_rounds
  where show_id = p_show_id;

  if v_round.id is not null then
    select coalesce((
      select version_row.version
      from public.studio2_prediction_round_versions version_row
      where version_row.round_id = v_round.id
    ), 1) into v_version;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'showId', p_show_id,
    'editionId', v_show.edition_id,
    'roundId', v_round.id,
    'roundVersion', v_version,
    'status', v_round.status,
    'exists', v_round.id is not null
  ));
end
$preview$;

create or replace function public.studio2_prediction_round_delete_preview(
  p_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_round public.prediction_rounds%rowtype;
  v_edition_id uuid;
  v_version bigint;
begin
  if p_round_id is null then
    raise exception 'Prediction round is required' using errcode = '22023';
  end if;

  select * into v_round from public.prediction_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'Prediction round not found' using errcode = 'P0002';
  end if;
  select edition_id into v_edition_id from public.shows where id = v_round.show_id;
  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_prediction_round_versions version_row
    where version_row.round_id = p_round_id
  ), 1) into v_version;

  return jsonb_build_object(
    'roundId', v_round.id,
    'showId', v_round.show_id,
    'editionId', v_edition_id,
    'roundVersion', v_version,
    'status', v_round.status
  );
end
$preview$;

create or replace function public.studio2_save_prediction_round(
  p_show_id uuid,
  p_opens_at timestamptz,
  p_locks_at timestamptz,
  p_status text,
  p_prediction_types text[],
  p_consensus_minimum integer,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_show public.shows%rowtype;
  v_round public.prediction_rounds%rowtype;
  v_types text[];
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_command text;
  v_risk text;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_changed boolean := false;
  v_action text;
  v_previous_status text;
  v_result jsonb;
begin
  if p_show_id is null
     or p_opens_at is null
     or p_locks_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_round_version is null
     or p_expected_round_version < 0 then
    raise exception 'Prediction round save parameters are incomplete' using errcode = '22023';
  end if;
  if p_opens_at >= p_locks_at then
    raise exception 'Prediction opening time must be before lock time' using errcode = '23514';
  end if;
  if p_status not in ('draft', 'open', 'locked', 'cancelled') then
    raise exception 'Prediction scoring states are owned by the scoring command' using errcode = '23514';
  end if;
  if p_consensus_minimum is null or p_consensus_minimum < 3 or p_consensus_minimum > 100 then
    raise exception 'Prediction consensus minimum must be between 3 and 100' using errcode = '23514';
  end if;

  v_types := private.v3_prediction_types_canonical(p_prediction_types);
  if coalesce(array_length(v_types, 1), 0) = 0
     or not (v_types <@ array[
       'winner','top_three','top_ten','qualifier','jury_winner','televote_winner','full_ranking'
     ]::text[]) then
    raise exception 'Prediction types are invalid' using errcode = '23514';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then raise exception 'Show not found' using errcode = 'P0002'; end if;
  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;
  if 'qualifier' = any(v_types) and coalesce(v_show.qualifier_count, 0) <= 0 then
    raise exception 'Qualifier prediction is not configured for this show' using errcode = '23514';
  end if;

  v_command := case p_status
    when 'open' then 'prediction.publish'
    when 'locked' then 'prediction.lock'
    else 'prediction.configure'
  end;
  v_risk := case when p_status in ('open', 'locked', 'cancelled') then 'R2' else 'R1' end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    v_risk,
    jsonb_build_object('showId', p_show_id, 'editionId', v_show.edition_id),
    jsonb_build_object(
      'opensAt', p_opens_at,
      'locksAt', p_locks_at,
      'status', p_status,
      'predictionTypes', to_jsonb(v_types),
      'consensusMinimum', p_consensus_minimum,
      'expectedRoundVersion', p_expected_round_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('studio2-prediction-round:' || p_show_id::text, 0));

  select * into v_round
  from public.prediction_rounds
  where show_id = p_show_id
  for update;

  if v_round.id is not null then
    if v_round.status in ('scoring', 'scored') then
      raise exception 'A scoring or scored Prediction round cannot be reconfigured'
        using errcode = '40001';
    end if;
    insert into public.studio2_prediction_round_versions(round_id, version, updated_at)
    values (v_round.id, 1, now())
    on conflict (round_id) do nothing;
    select version into v_current_version
    from public.studio2_prediction_round_versions
    where round_id = v_round.id
    for update;
  else
    v_current_version := 0;
  end if;

  if p_expected_round_version <> v_current_version then
    raise exception 'Prediction round changed since this preview was loaded. Refresh before saving.'
      using errcode = '40001';
  end if;

  if v_round.id is null then
    insert into public.prediction_rounds(
      show_id, opens_at, locks_at, status, prediction_types, scoring_version,
      consensus_minimum, updated_at
    ) values (
      p_show_id, p_opens_at, p_locks_at, p_status, v_types, 'v1',
      p_consensus_minimum, now()
    ) returning * into v_round;

    insert into public.studio2_prediction_round_versions(round_id, version, updated_at)
    values (v_round.id, 1, now());
    v_next_version := 1;
    v_changed := true;
    v_action := 'create';
    v_previous_status := null;
  else
    v_previous_status := v_round.status;
    v_changed :=
      v_round.opens_at is distinct from p_opens_at
      or v_round.locks_at is distinct from p_locks_at
      or v_round.status is distinct from p_status
      or private.v3_prediction_types_canonical(v_round.prediction_types) is distinct from v_types
      or v_round.consensus_minimum is distinct from p_consensus_minimum;

    if v_changed then
      update public.prediction_rounds
      set opens_at = p_opens_at,
          locks_at = p_locks_at,
          status = p_status,
          prediction_types = v_types,
          consensus_minimum = p_consensus_minimum,
          updated_at = now()
      where id = v_round.id
      returning * into v_round;

      update public.studio2_prediction_round_versions
      set version = version + 1, updated_at = now()
      where round_id = v_round.id
      returning version into v_next_version;
    else
      v_next_version := v_current_version;
    end if;

    v_action := case
      when not v_changed then 'noop'
      when p_status = 'open' and v_previous_status is distinct from 'open' then 'publish'
      when p_status = 'locked' and v_previous_status is distinct from 'locked' then 'lock'
      when p_status = 'cancelled' and v_previous_status is distinct from 'cancelled' then 'cancel'
      else 'update'
    end;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'action', v_action,
    'roundId', v_round.id,
    'showId', v_round.show_id,
    'editionId', v_show.edition_id,
    'previousStatus', v_previous_status,
    'status', v_round.status,
    'opensAt', v_round.opens_at,
    'locksAt', v_round.locks_at,
    'predictionTypes', to_jsonb(v_round.prediction_types),
    'consensusMinimum', v_round.consensus_minimum,
    'previousRoundVersion', v_current_version,
    'roundVersion', v_next_version
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$save$;

create or replace function public.studio2_delete_prediction_round(
  p_round_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $delete$
declare
  v_round public.prediction_rounds%rowtype;
  v_edition_id uuid;
  v_current_version bigint;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
begin
  if p_round_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_round_version is null
     or p_expected_round_version < 1 then
    raise exception 'Prediction round delete parameters are incomplete' using errcode = '22023';
  end if;

  select * into v_round from public.prediction_rounds where id = p_round_id;
  if v_round.id is null then raise exception 'Prediction round not found' using errcode = 'P0002'; end if;
  select edition_id into v_edition_id from public.shows where id = v_round.show_id;
  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'prediction.configure',
    'R1',
    jsonb_build_object('roundId', p_round_id, 'showId', v_round.show_id, 'editionId', v_edition_id),
    jsonb_build_object('action', 'delete', 'expectedRoundVersion', p_expected_round_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('studio2-prediction-round:' || v_round.show_id::text, 0));
  select * into v_round from public.prediction_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception 'Prediction round not found' using errcode = 'P0002'; end if;
  if v_round.status <> 'draft' then
    raise exception 'Only a draft Prediction round can be deleted' using errcode = '23514';
  end if;
  if exists (select 1 from public.prediction_entries where round_id = p_round_id) then
    raise exception 'A Prediction round with saved entries cannot be deleted' using errcode = '23514';
  end if;

  insert into public.studio2_prediction_round_versions(round_id, version, updated_at)
  values (p_round_id, 1, now()) on conflict (round_id) do nothing;
  select version into v_current_version
  from public.studio2_prediction_round_versions
  where round_id = p_round_id
  for update;

  if p_expected_round_version <> v_current_version then
    raise exception 'Prediction round changed since this preview was loaded. Refresh before deleting.'
      using errcode = '40001';
  end if;

  delete from public.prediction_rounds where id = p_round_id;

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'action', 'delete',
    'roundId', p_round_id,
    'showId', v_round.show_id,
    'editionId', v_edition_id,
    'previousStatus', v_round.status,
    'status', 'deleted',
    'previousRoundVersion', v_current_version,
    'roundVersion', v_current_version + 1
  );
  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$delete$;

create or replace function private.v3_emit_prediction_round_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_round_id uuid;
  v_show_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_current_version bigint;
  v_action text;
  v_round public.prediction_rounds%rowtype;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('prediction.configure', 'prediction.lock', 'prediction.publish')
     or coalesce((new.result ->> 'changed')::boolean, false) is false then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Prediction round operation has invalid event provenance'
      using errcode = '23514';
  end;
  v_action := new.result ->> 'action';

  if v_action = 'delete' then
    if exists (select 1 from public.prediction_rounds where id = v_round_id) then
      raise exception 'Deleted Prediction round still exists at event emission'
        using errcode = '23514';
    end if;
  else
    select * into v_round from public.prediction_rounds where id = v_round_id;
    select version into v_current_version
    from public.studio2_prediction_round_versions
    where round_id = v_round_id;
    if v_round.id is null
       or v_round.show_id is distinct from v_show_id
       or v_current_version is distinct from v_round_version then
      raise exception 'Completed Prediction round operation lacks canonical event provenance'
        using errcode = '23514';
    end if;
  end if;

  perform private.v3_emit_domain_event(
    'prediction.changed',
    'prediction_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'action', v_action,
      'previousStatus', new.result ->> 'previousStatus',
      'status', new.result ->> 'status',
      'opensAt', new.result -> 'opensAt',
      'locksAt', new.result -> 'locksAt',
      'predictionTypes', new.result -> 'predictionTypes',
      'consensusMinimum', new.result -> 'consensusMinimum',
      'previousRoundVersion', new.result -> 'previousRoundVersion',
      'roundVersion', new.result -> 'roundVersion'
    )),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_prediction_round_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_prediction_round_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_prediction_round_operation_event
after update of status, result
on public.studio2_operation_receipts
for each row execute function private.v3_emit_prediction_round_operation_event();

-- All browser writes now pass through versioned operation RPCs. Keep select
-- available under existing RLS/publication rules and preserve service authority.
revoke insert, update, delete on table public.prediction_rounds from authenticated;

revoke all on function public.studio2_prediction_round_config_preview(uuid) from public, anon;
revoke all on function public.studio2_prediction_round_delete_preview(uuid) from public, anon;
revoke all on function public.studio2_save_prediction_round(uuid, timestamptz, timestamptz, text, text[], integer, uuid, text, bigint) from public, anon;
revoke all on function public.studio2_delete_prediction_round(uuid, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_prediction_round_config_preview(uuid) to authenticated;
grant execute on function public.studio2_prediction_round_delete_preview(uuid) to authenticated;
grant execute on function public.studio2_save_prediction_round(uuid, timestamptz, timestamptz, text, text[], integer, uuid, text, bigint) to authenticated;
grant execute on function public.studio2_delete_prediction_round(uuid, uuid, text, bigint) to authenticated;

notify pgrst, 'reload schema';

commit;

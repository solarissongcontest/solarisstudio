begin;

-- System V3 S5 Prediction scoring boundary.
--
-- Keep the established Prediction Arena scoring algorithm as the calculation
-- authority, but stop exposing it as a browser-callable mutation. Canonical V3
-- scoring now has a server-owned semantic revision, optimistic concurrency,
-- operation-receipt idempotency and a transactional prediction.scored fact.

create table if not exists public.studio2_prediction_score_versions (
  round_id uuid primary key references public.prediction_rounds(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_prediction_score_versions (round_id, version, updated_at)
select
  round_row.id,
  case
    when round_row.status = 'scored'
      or exists (
        select 1
        from public.prediction_entries entry
        join public.prediction_scores score on score.entry_id = entry.id
        where entry.round_id = round_row.id
      )
      then 1
    else 0
  end,
  now()
from public.prediction_rounds round_row
on conflict (round_id) do nothing;

alter table public.studio2_prediction_score_versions enable row level security;
revoke all on table public.studio2_prediction_score_versions from public, anon, authenticated;
grant all on table public.studio2_prediction_score_versions to service_role;

create or replace function public.studio2_prediction_score_preview(
  p_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_round public.prediction_rounds%rowtype;
  v_edition_id uuid;
  v_version bigint := 0;
begin
  if p_round_id is null then
    raise exception 'Prediction round is required' using errcode = '22023';
  end if;

  select round_row.*
  into v_round
  from public.prediction_rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Prediction round not found' using errcode = 'P0002';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = v_round.show_id;

  if v_edition_id is null then
    raise exception 'Prediction round has no canonical edition scope' using errcode = '23514';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_prediction_score_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_version;

  return jsonb_build_object(
    'roundId', v_round.id,
    'showId', v_round.show_id,
    'editionId', v_edition_id,
    'status', v_round.status,
    'scoringVersion', v_round.scoring_version,
    'scoreRevision', v_version,
    'locksAt', v_round.locks_at
  );
end
$preview$;

create or replace function public.studio2_score_prediction_round(
  p_round_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_score_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $score$
declare
  v_round public.prediction_rounds%rowtype;
  v_edition_id uuid;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_current_revision bigint := 0;
  v_next_revision bigint := 0;
  v_scored_count integer := 0;
  v_result jsonb;
begin
  if p_round_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_score_revision is null
     or p_expected_score_revision < 0 then
    raise exception 'Round, operation, idempotency key and expected score revision are required'
      using errcode = '22023';
  end if;

  select round_row.*
  into v_round
  from public.prediction_rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Prediction round not found' using errcode = 'P0002';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = v_round.show_id;

  if v_edition_id is null then
    raise exception 'Prediction round has no canonical edition scope' using errcode = '23514';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'prediction.score',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'showId', v_round.show_id,
      'editionId', v_edition_id
    ),
    jsonb_build_object(
      'expectedScoreRevision', p_expected_score_revision
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-prediction-score:' || p_round_id::text, 0)
  );

  select round_row.*
  into v_round
  from public.prediction_rounds round_row
  where round_row.id = p_round_id
  for update;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = v_round.show_id;

  insert into public.studio2_prediction_score_versions (round_id, version, updated_at)
  values (
    p_round_id,
    case
      when v_round.status = 'scored'
        or exists (
          select 1
          from public.prediction_entries entry
          join public.prediction_scores score on score.entry_id = entry.id
          where entry.round_id = p_round_id
        )
        then 1
      else 0
    end,
    now()
  )
  on conflict (round_id) do nothing;

  select version_row.version
  into v_current_revision
  from public.studio2_prediction_score_versions version_row
  where version_row.round_id = p_round_id
  for update;

  if p_expected_score_revision <> v_current_revision then
    raise exception 'Prediction scores changed since this preview was loaded. Refresh before scoring again.'
      using errcode = '40001';
  end if;

  select public.score_prediction_round(p_round_id)
  into v_scored_count;

  update public.studio2_prediction_score_versions
  set version = version + 1,
      updated_at = now()
  where round_id = p_round_id
  returning version into v_next_revision;

  select round_row.*
  into v_round
  from public.prediction_rounds round_row
  where round_row.id = p_round_id;

  if v_round.status <> 'scored' then
    raise exception 'Prediction scoring did not reach scored state' using errcode = '23514';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'roundId', p_round_id,
    'showId', v_round.show_id,
    'editionId', v_edition_id,
    'scoredCount', v_scored_count,
    'scoringVersion', v_round.scoring_version,
    'previousScoreRevision', v_current_revision,
    'scoreRevision', v_next_revision,
    'status', v_round.status
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$score$;

create or replace function private.v3_emit_prediction_score_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_round_id uuid;
  v_show_id uuid;
  v_edition_id uuid;
  v_score_revision bigint;
  v_current_revision bigint;
  v_actual_show_id uuid;
  v_actual_edition_id uuid;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'prediction.score' then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_score_revision := nullif(new.result ->> 'scoreRevision', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Prediction score operation has invalid event provenance'
      using errcode = '23514';
  end;

  select round_row.show_id, show_row.edition_id
  into v_actual_show_id, v_actual_edition_id
  from public.prediction_rounds round_row
  join public.shows show_row on show_row.id = round_row.show_id
  where round_row.id = v_round_id;

  select version_row.version
  into v_current_revision
  from public.studio2_prediction_score_versions version_row
  where version_row.round_id = v_round_id;

  if v_round_id is null
     or v_show_id is null
     or v_edition_id is null
     or v_score_revision is null
     or v_actual_show_id is distinct from v_show_id
     or v_actual_edition_id is distinct from v_edition_id
     or v_current_revision is distinct from v_score_revision then
    raise exception 'Completed Prediction score operation lacks canonical event provenance'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'prediction.scored',
    'prediction_score',
    v_round_id::text,
    v_score_revision,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'roundId', v_round_id,
      'scoredCount', (new.result ->> 'scoredCount')::integer,
      'scoringVersion', new.result ->> 'scoringVersion',
      'previousScoreRevision', (new.result ->> 'previousScoreRevision')::bigint,
      'scoreRevision', v_score_revision,
      'status', new.result ->> 'status'
    ),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_prediction_score_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_prediction_score_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_prediction_score_operation_event
after update of status, result
on public.studio2_operation_receipts
for each row
execute function private.v3_emit_prediction_score_operation_event();

revoke all on function public.score_prediction_round(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.studio2_prediction_score_preview(uuid)
  from public, anon;
grant execute on function public.studio2_prediction_score_preview(uuid)
  to authenticated;

revoke all on function public.studio2_score_prediction_round(uuid, uuid, text, bigint)
  from public, anon;
grant execute on function public.studio2_score_prediction_round(uuid, uuid, text, bigint)
  to authenticated;

notify pgrst, 'reload schema';

commit;

begin;

-- System V3: make Result Integrity recomputation one governed, edition-scoped,
-- replay-safe operation. Counterfactual influence evidence stays derived and
-- never becomes ballot or official-result authority.

create table if not exists televoting.round_integrity_evidence_versions (
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  calculation_version integer not null check (calculation_version > 0),
  evidence_revision bigint not null check (evidence_revision > 0),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count between 0 and 500),
  operation_id uuid not null,
  correlation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (round_id, calculation_version)
);

alter table televoting.round_integrity_evidence_versions enable row level security;
revoke all on table televoting.round_integrity_evidence_versions from anon, authenticated;

create or replace function televoting.studio2_apply_result_integrity_recompute(
  p_solaris_edition_id uuid,
  p_round_id uuid,
  p_expected_calculation_version integer,
  p_evidence jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth, extensions
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_resolved_edition_id uuid;
  v_evidence jsonb := coalesce(p_evidence, '[]'::jsonb);
  v_evidence_fingerprint text;
  v_evidence_count integer;
  v_previous_revision bigint := 0;
  v_next_revision bigint;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_item jsonb;
  v_subject_key text;
  v_members jsonb;
  v_result jsonb;
begin
  if p_solaris_edition_id is null
     or p_round_id is null
     or p_expected_calculation_version is null
     or p_expected_calculation_version <= 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Edition, round, expected calculation version and operation identity are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_evidence) <> 'array' then
    raise exception 'Result Integrity evidence must be a JSON array'
      using errcode = '22023';
  end if;

  v_evidence_count := jsonb_array_length(v_evidence);
  if v_evidence_count > 500 then
    raise exception 'Result Integrity evidence exceeds the bounded row limit'
      using errcode = '54000';
  end if;

  -- Validate the complete replacement before touching existing evidence. The
  -- RPC transaction also guarantees any later insert failure rolls the delete
  -- back, so current-version evidence cannot be stranded half-replaced.
  for v_item in select value from jsonb_array_elements(v_evidence)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Result Integrity evidence rows must be objects'
        using errcode = '22023';
    end if;

    v_subject_key := nullif(btrim(coalesce(v_item ->> 'subjectKey', '')), '');
    v_members := coalesce(v_item -> 'members', '[]'::jsonb);

    if v_subject_key is null or length(v_subject_key) > 240 then
      raise exception 'Result Integrity subject key is invalid'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_members) <> 'array' or jsonb_array_length(v_members) > 500 then
      raise exception 'Result Integrity members must be a bounded JSON array'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'winnerChanged') <> 'boolean'
       or jsonb_typeof(v_item -> 'topThreeChanged') <> 'boolean'
       or jsonb_typeof(v_item -> 'qualifierChanged') <> 'boolean' then
      raise exception 'Result Integrity outcome flags are invalid'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'maxRankMovement') <> 'number'
       or (v_item ->> 'maxRankMovement') !~ '^[0-9]+$'
       or jsonb_typeof(v_item -> 'maxPointMovement') <> 'number'
       or (v_item ->> 'maxPointMovement') !~ '^[0-9]+$' then
      raise exception 'Result Integrity movement values must be non-negative integers'
        using errcode = '22023';
    end if;
    if (v_item ->> 'maxRankMovement')::bigint > 2147483647
       or (v_item ->> 'maxPointMovement')::bigint > 2147483647 then
      raise exception 'Result Integrity movement values exceed storage bounds'
        using errcode = '22023';
    end if;
    if v_item ? 'mostAffectedEntry'
       and v_item -> 'mostAffectedEntry' <> 'null'::jsonb
       and (
         jsonb_typeof(v_item -> 'mostAffectedEntry') <> 'string'
         or length(v_item ->> 'mostAffectedEntry') > 240
       ) then
      raise exception 'Result Integrity affected entry is invalid'
        using errcode = '22023';
    end if;
  end loop;

  if (
    select count(*)
    from jsonb_array_elements(v_evidence) item
  ) <> (
    select count(distinct item ->> 'subjectKey')
    from jsonb_array_elements(v_evidence) item
  ) then
    raise exception 'Result Integrity evidence contains duplicate cluster identities'
      using errcode = '23505';
  end if;

  v_resolved_edition_id := private.v3_televote_solaris_edition_for_round(p_round_id);
  if v_resolved_edition_id is distinct from p_solaris_edition_id then
    raise exception 'Voting round is outside the requested Solaris edition'
      using errcode = '23514';
  end if;

  if not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_evidence_fingerprint := encode(
    extensions.digest(convert_to(v_evidence::text, 'UTF8'), 'sha256'),
    'hex'
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.result_integrity.recompute',
    'R2',
    jsonb_build_object(
      'solarisEditionId', p_solaris_edition_id,
      'roundId', p_round_id
    ),
    jsonb_build_object(
      'expectedCalculationVersion', p_expected_calculation_version,
      'evidenceFingerprint', v_evidence_fingerprint,
      'evidenceRowCount', v_evidence_count
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-result-integrity:' || p_round_id::text, 0)
  );

  select round_row.*
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;
  if v_round.calculation_version is distinct from p_expected_calculation_version then
    raise exception 'Result Integrity calculation version changed; refresh before recomputing'
      using errcode = '40001';
  end if;
  if v_round.televote_engine_version <> 'robust-televote-v2' then
    raise exception 'Result Integrity recompute requires Robust Televote v2'
      using errcode = '23514';
  end if;

  select version_row.evidence_revision
  into v_previous_revision
  from televoting.round_integrity_evidence_versions version_row
  where version_row.round_id = p_round_id
    and version_row.calculation_version = p_expected_calculation_version
  for update;

  v_next_revision := coalesce(v_previous_revision, 0) + 1;

  delete from televoting.round_influence_results evidence
  where evidence.round_id = p_round_id
    and evidence.calculation_version = p_expected_calculation_version
    and evidence.subject_type = 'cluster';

  for v_item in select value from jsonb_array_elements(v_evidence)
  loop
    insert into televoting.round_influence_results (
      round_id,
      calculation_version,
      subject_type,
      subject_key,
      members,
      winner_changed,
      top_three_changed,
      qualifier_changed,
      max_rank_movement,
      max_point_movement,
      most_affected_entry
    ) values (
      p_round_id,
      p_expected_calculation_version,
      'cluster',
      btrim(v_item ->> 'subjectKey'),
      coalesce(v_item -> 'members', '[]'::jsonb),
      (v_item ->> 'winnerChanged')::boolean,
      (v_item ->> 'topThreeChanged')::boolean,
      (v_item ->> 'qualifierChanged')::boolean,
      (v_item ->> 'maxRankMovement')::integer,
      (v_item ->> 'maxPointMovement')::integer,
      nullif(v_item ->> 'mostAffectedEntry', '')
    );
  end loop;

  insert into televoting.round_integrity_evidence_versions (
    round_id,
    calculation_version,
    evidence_revision,
    evidence_fingerprint,
    row_count,
    operation_id,
    correlation_id,
    updated_at
  ) values (
    p_round_id,
    p_expected_calculation_version,
    v_next_revision,
    v_evidence_fingerprint,
    v_evidence_count,
    v_canonical_operation_id,
    coalesce(p_correlation_id, v_canonical_operation_id),
    now()
  )
  on conflict (round_id, calculation_version) do update
  set evidence_revision = excluded.evidence_revision,
      evidence_fingerprint = excluded.evidence_fingerprint,
      row_count = excluded.row_count,
      operation_id = excluded.operation_id,
      correlation_id = excluded.correlation_id,
      updated_at = excluded.updated_at;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'correlationId', coalesce(p_correlation_id, v_canonical_operation_id),
    'solarisEditionId', p_solaris_edition_id,
    'roundId', p_round_id,
    'calculationVersion', p_expected_calculation_version,
    'evidenceRevision', v_next_revision,
    'evidenceFingerprint', v_evidence_fingerprint,
    'rowCount', v_evidence_count
  );

  perform private.v3_emit_domain_event(
    'televote.result_integrity_recomputed',
    'televote_result_integrity',
    p_round_id::text || ':' || p_expected_calculation_version::text,
    v_next_revision,
    v_canonical_operation_id,
    p_solaris_edition_id,
    null,
    jsonb_build_object(
      'roundId', p_round_id,
      'calculationVersion', p_expected_calculation_version,
      'evidenceRevision', v_next_revision,
      'rowCount', v_evidence_count,
      'evidenceFingerprint', v_evidence_fingerprint
    ),
    1,
    array[]::text[]
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_result_integrity_recompute(
  uuid, uuid, integer, jsonb, uuid, text, uuid
) from public, anon;
grant execute on function televoting.studio2_apply_result_integrity_recompute(
  uuid, uuid, integer, jsonb, uuid, text, uuid
) to authenticated, service_role;

comment on function televoting.studio2_apply_result_integrity_recompute(
  uuid, uuid, integer, jsonb, uuid, text, uuid
) is
  'Atomically replaces cluster Result Integrity evidence for one exact Solaris edition, voting round and calculation version under the canonical S2 operation envelope.';

notify pgrst, 'reload schema';

commit;

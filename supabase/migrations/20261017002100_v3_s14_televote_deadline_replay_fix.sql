begin;

-- Keep one semantic command identity across initial deadline set and later
-- extension. The durable result carries action=set|extend; replay must not
-- change command identity merely because the first write changed round state.

create or replace function televoting.studio2_apply_round_deadline_change(
  p_round_id uuid,
  p_new_deadline_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_round_version bigint := 0;
  v_next_round_version bigint := 0;
  v_action text;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
begin
  if p_round_id is null
     or p_new_deadline_at is null
     or p_operation_id is null
     or p_expected_round_version is null
     or p_expected_round_version < 0 then
    raise exception 'Round, deadline, operation and expected version are required'
      using errcode = '22023';
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  v_solaris_edition_id := private.v3_televote_solaris_edition_for_round(p_round_id);

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'televote.deadline.change',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id
    ),
    jsonb_build_object(
      'newDeadline', p_new_deadline_at,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-televote-round-deadline:' || p_round_id::text, 0)
  );

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_current_round_version;

  if p_expected_round_version <> v_current_round_version then
    raise exception 'Televote round deadline changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  if p_new_deadline_at <= now() then
    raise exception 'New Televote deadline must be in the future'
      using errcode = '23514';
  end if;
  if v_round.closes_at is not null and p_new_deadline_at <= v_round.closes_at then
    raise exception 'New Televote deadline must extend the existing deadline'
      using errcode = '23514';
  end if;
  if v_round.results_status in ('locked', 'published') then
    raise exception 'Locked or published Televote results cannot change the voting deadline'
      using errcode = '23514';
  end if;

  v_action := case when v_round.closes_at is null then 'set' else 'extend' end;

  update televoting.rounds
  set closes_at = p_new_deadline_at,
      updated_at = now()
  where id = p_round_id;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), v_current_round_version + 1)
  into v_next_round_version;

  v_result := jsonb_build_object(
    'ok', true,
    'roundId', p_round_id,
    'solarisEditionId', v_solaris_edition_id,
    'status', v_round.status,
    'action', v_action,
    'previousDeadline', v_round.closes_at,
    'deadline', p_new_deadline_at,
    'previousRoundVersion', v_current_round_version,
    'roundVersion', v_next_round_version
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$apply$;

create or replace function private.v3_emit_televote_deadline_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $emit$
declare
  v_event_type text;
  v_round_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_payload jsonb;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'televote.deadline.change' then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Televote deadline operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_round_id is null or v_edition_id is null or v_round_version is null then
    raise exception 'Completed Televote deadline operation lacks event provenance'
      using errcode = '23514';
  end if;

  if private.v3_televote_solaris_edition_for_round(v_round_id)
     is distinct from v_edition_id then
    raise exception 'Completed Televote deadline operation is outside canonical edition scope'
      using errcode = '23514';
  end if;

  v_event_type := case
    when new.result ->> 'action' = 'extend' then 'televote.extended'
    else 'televote.deadline_set'
  end;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'roundId', v_round_id,
    'status', new.result ->> 'status',
    'previousDeadline', new.result -> 'previousDeadline',
    'deadline', new.result -> 'deadline',
    'previousRoundVersion', new.result -> 'previousRoundVersion',
    'roundVersion', new.result -> 'roundVersion'
  ));

  perform private.v3_emit_domain_event(
    v_event_type,
    'televote_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['televote.tasks']::text[]
  );

  return new;
end
$emit$;

notify pgrst, 'reload schema';

commit;

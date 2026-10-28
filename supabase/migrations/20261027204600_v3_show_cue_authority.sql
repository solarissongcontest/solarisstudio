begin;

select public.v3_register_migration_contract(
  'v3.show.cue-authority', 1, 'forward_fix_only', false, null,
  'Cut cue writes over to scoped versioned commands and receipt-bound guards; retain inaccessible implementation helpers and verify lock recovery and duplicate advance locally.'
);

-- V3 Show/Cue authority cutover.
--
-- The legacy Studio 2 rundown functions already contain the domain-specific
-- validation, row locking, revision CAS and legal cue transition rules.  They
-- are retained only as private-in-practice implementation helpers: browser and
-- service-role callers lose EXECUTE, while the V3 commands below add canonical
-- operation identity, semantic idempotency, DomainEvent persistence and lost-
-- response readback through the shared operation receipt contract.
--
-- A database guard also prevents any raw UPDATE of shows.broadcast_config from
-- changing the studio2Rundown subtree.  This is deliberately narrower than a
-- blanket shows-table cutover because publication, hosting, design and lineup
-- have independent domain owners that are being migrated separately.

create or replace function private.v3_show_cue_operation_is_current(
  p_operation_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $authority$
  select exists (
    select 1
    from public.studio2_operation_receipts receipt
    where receipt.operation_id::text = nullif(btrim(coalesce(p_operation_id, '')), '')
      and receipt.actor_id = auth.uid()
      and receipt.status = 'processing'
      and receipt.command in (
        'show.cue.configure',
        'show.cue.lock',
        'show.cue.transition'
      )
  );
$authority$;

revoke all on function private.v3_show_cue_operation_is_current(text)
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_show_cue_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $guard$
declare
  v_marker text := current_setting('app.v3_show_cue_operation_id', true);
begin
  if coalesce(new.broadcast_config, '{}'::jsonb) -> 'studio2Rundown'
       is not distinct from
     coalesce(old.broadcast_config, '{}'::jsonb) -> 'studio2Rundown' then
    return new;
  end if;

  if not private.v3_show_cue_operation_is_current(v_marker) then
    raise exception using
      errcode = '42501',
      message = 'SHOW_CUE_AUTHORITY',
      hint = 'Mutate broadcast rundown state through the canonical V3 show cue commands.';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_show_cue_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_show_cue_authority on public.shows;
create trigger v3_guard_show_cue_authority
before update of broadcast_config on public.shows
for each row execute function private.v3_guard_show_cue_authority();

-- Edition design inheritance is a trigger implementation, not a peer cue
-- authority.  Preserve runtime-owned subtrees and stop exposing the trigger
-- function as an ad-hoc service-role command.  Pinning the search_path also
-- removes the legacy SECURITY DEFINER search-path weakness seen in catalog.
create or replace function public.sync_edition_design_to_shows()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $sync$
begin
  update public.shows show_row
  set
    theme_id = new.theme_id,
    broadcast_config =
      coalesce(new.broadcast_config, '{}'::jsonb)
      || case
        when coalesce(show_row.broadcast_config, '{}'::jsonb) ? 'showMode'
          then jsonb_build_object('showMode', show_row.broadcast_config -> 'showMode')
        else '{}'::jsonb
      end
      || case
        when coalesce(show_row.broadcast_config, '{}'::jsonb) ? 'studio2Rundown'
          then jsonb_build_object('studio2Rundown', show_row.broadcast_config -> 'studio2Rundown')
        else '{}'::jsonb
      end
  where show_row.edition_id = new.id;
  return new;
end
$sync$;

revoke all on function public.sync_edition_design_to_shows()
  from public, anon, authenticated, service_role;

create or replace function public.v3_save_show_rundown(
  p_show_id uuid,
  p_expected_revision integer,
  p_start_at timestamptz,
  p_segments jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_edition_id uuid;
  v_claim jsonb;
  v_rundown jsonb;
  v_result jsonb;
  v_revision bigint;
begin
  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  perform private.v3_require_active_auth_session();
  if not private.studio2_can_manage_broadcast(auth.uid(), v_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.cue.configure',
    'R2',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'startAt', p_start_at,
      'segments', coalesce(p_segments, '[]'::jsonb),
      'reason', btrim(coalesce(p_reason, ''))
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result' -> 'rundown';
    end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  perform set_config('app.v3_show_cue_operation_id', p_operation_id::text, true);
  v_rundown := public.studio2_save_broadcast_rundown(
    p_show_id,
    p_expected_revision,
    p_start_at,
    p_segments,
    p_reason
  );
  v_revision := coalesce((v_rundown ->> 'revision')::bigint, -1);
  if v_revision < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_RUNDOWN_RESULT';
  end if;

  v_result := jsonb_build_object(
    'showId', p_show_id,
    'revision', v_revision,
    'rundown', v_rundown
  );

  perform private.v3_emit_domain_event(
    'show.cue_changed',
    'show',
    p_show_id::text,
    v_revision,
    p_operation_id,
    v_edition_id,
    p_show_id,
    jsonb_build_object(
      'changeKind', 'rundown_configured',
      'revision', v_revision,
      'reason', btrim(coalesce(p_reason, ''))
    ),
    1,
    array[]::text[]
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_rundown;
end
$command$;

create or replace function public.v3_set_show_rundown_lock(
  p_show_id uuid,
  p_expected_revision integer,
  p_locked boolean,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_edition_id uuid;
  v_claim jsonb;
  v_rundown jsonb;
  v_result jsonb;
  v_revision bigint;
begin
  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  perform private.v3_require_active_auth_session();
  if not private.studio2_can_manage_broadcast(auth.uid(), v_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.cue.lock',
    'R2',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'locked', p_locked,
      'reason', btrim(coalesce(p_reason, ''))
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result' -> 'rundown';
    end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  perform set_config('app.v3_show_cue_operation_id', p_operation_id::text, true);
  v_rundown := public.studio2_set_broadcast_rundown_lock(
    p_show_id,
    p_expected_revision,
    p_locked,
    p_reason
  );
  v_revision := coalesce((v_rundown ->> 'revision')::bigint, -1);
  if v_revision < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_RUNDOWN_RESULT';
  end if;

  v_result := jsonb_build_object(
    'showId', p_show_id,
    'revision', v_revision,
    'rundown', v_rundown
  );

  -- An already-satisfied lock request is a successful idempotent semantic no-op,
  -- not a second cue change event.
  if v_revision <> p_expected_revision then
    perform private.v3_emit_domain_event(
      'show.cue_changed',
      'show',
      p_show_id::text,
      v_revision,
      p_operation_id,
      v_edition_id,
      p_show_id,
      jsonb_build_object(
        'changeKind', case when p_locked then 'rundown_locked' else 'rundown_unlocked' end,
        'revision', v_revision,
        'reason', btrim(coalesce(p_reason, ''))
      ),
      1,
      array[]::text[]
    );
  end if;

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_rundown;
end
$command$;

create or replace function public.v3_transition_show_cue(
  p_show_id uuid,
  p_expected_revision integer,
  p_segment_id text,
  p_to_status text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_edition_id uuid;
  v_claim jsonb;
  v_rundown jsonb;
  v_result jsonb;
  v_revision bigint;
  v_before jsonb;
  v_from_status text;
begin
  select show_row.edition_id,
         coalesce(show_row.broadcast_config, '{}'::jsonb) -> 'studio2Rundown'
  into v_edition_id, v_before
  from public.shows show_row
  where show_row.id = p_show_id;
  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  select segment ->> 'status'
  into v_from_status
  from jsonb_array_elements(coalesce(v_before -> 'segments', '[]'::jsonb)) items(segment)
  where segment ->> 'id' = p_segment_id;

  perform private.v3_require_active_auth_session();
  if not private.studio2_can_manage_broadcast(auth.uid(), v_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.cue.transition',
    'R2',
    jsonb_build_object('editionId', v_edition_id, 'showId', p_show_id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'segmentId', nullif(btrim(coalesce(p_segment_id, '')), ''),
      'toStatus', p_to_status,
      'reason', btrim(coalesce(p_reason, ''))
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result' -> 'rundown';
    end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  perform set_config('app.v3_show_cue_operation_id', p_operation_id::text, true);
  v_rundown := public.studio2_transition_broadcast_segment(
    p_show_id,
    p_expected_revision,
    p_segment_id,
    p_to_status,
    p_reason
  );
  v_revision := coalesce((v_rundown ->> 'revision')::bigint, -1);
  if v_revision < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_RUNDOWN_RESULT';
  end if;

  v_result := jsonb_build_object(
    'showId', p_show_id,
    'segmentId', p_segment_id,
    'fromStatus', v_from_status,
    'toStatus', p_to_status,
    'revision', v_revision,
    'rundown', v_rundown
  );

  perform private.v3_emit_domain_event(
    'show.cue_changed',
    'show',
    p_show_id::text,
    v_revision,
    p_operation_id,
    v_edition_id,
    p_show_id,
    jsonb_build_object(
      'changeKind', 'cue_transitioned',
      'segmentId', p_segment_id,
      'fromStatus', v_from_status,
      'toStatus', p_to_status,
      'revision', v_revision,
      'reason', btrim(coalesce(p_reason, ''))
    ),
    1,
    array[]::text[]
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_rundown;
end
$command$;

-- Cut off the old callable peer authorities.  The functions remain callable by
-- their owner so the V3 wrappers can reuse the battle-tested validation core.
revoke all on function public.studio2_save_broadcast_rundown(uuid, integer, timestamptz, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.studio2_set_broadcast_rundown_lock(uuid, integer, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.studio2_transition_broadcast_segment(uuid, integer, text, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.v3_save_show_rundown(uuid, integer, timestamptz, jsonb, text, uuid, text)
  from public, anon, service_role;
revoke all on function public.v3_set_show_rundown_lock(uuid, integer, boolean, text, uuid, text)
  from public, anon, service_role;
revoke all on function public.v3_transition_show_cue(uuid, integer, text, text, text, uuid, text)
  from public, anon, service_role;

grant execute on function public.v3_save_show_rundown(uuid, integer, timestamptz, jsonb, text, uuid, text)
  to authenticated;
grant execute on function public.v3_set_show_rundown_lock(uuid, integer, boolean, text, uuid, text)
  to authenticated;
grant execute on function public.v3_transition_show_cue(uuid, integer, text, text, text, uuid, text)
  to authenticated;

comment on function public.v3_save_show_rundown(uuid, integer, timestamptz, jsonb, text, uuid, text) is
  'Canonical V3 rundown configuration command: scoped CAS + durable operation receipt + show.cue_changed event.';
comment on function public.v3_set_show_rundown_lock(uuid, integer, boolean, text, uuid, text) is
  'Canonical V3 rundown lock command: scoped CAS + durable operation receipt + show.cue_changed event for real lock changes.';
comment on function public.v3_transition_show_cue(uuid, integer, text, text, text, uuid, text) is
  'Canonical V3 live cue transition command: legal transition validation + CAS + idempotency + show.cue_changed event.';

notify pgrst, 'reload schema';

commit;

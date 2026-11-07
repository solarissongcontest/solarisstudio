begin;

-- System V3 S9 follow-up for the newly instrumented participant Jury command.
-- Keep the existing Jury ballot authority and the S2 observability wrapper from
-- the preceding migration, but close two boundaries before cutover:
--   * malformed non-array ballot JSON must fail before any array function runs;
--   * a succeeded participant submission must enter the already-canonical S5
--     jury.ballot_changed consequence path so Organizer task/readiness effects
--     derive from the same completed fact.
--
-- This is intentionally additive. It does not create another ballot writer,
-- task engine or event type.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9.jury-submit-event-validation-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Fail closed on malformed participant Jury ballots and bridge successful canonical Jury submit operations into the existing jury.ballot_changed consequence path.'
);
select set_config('request.jwt.claim.role', '', true);

-- ---------------------------------------------------------------------------
-- Safe public argument gate
-- ---------------------------------------------------------------------------

alter function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  rename to v3_submit_jury_ballot_s2_impl;
revoke all on function public.v3_submit_jury_ballot_s2_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.v3_submit_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid,
  _operation_id uuid,
  _request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $jury_submit_gate$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null or _preflight_id is null or _operation_id is null then
    raise exception 'Jury submission context is incomplete' using errcode = '22023';
  end if;

  -- Do not combine the shape check with jsonb_array_length() in one boolean
  -- expression. PostgreSQL does not promise application-style short-circuit
  -- evaluation order for arbitrary expressions.
  if jsonb_typeof(_entries) is distinct from 'array' then
    raise exception 'Jury ballot must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(_entries) < 1
     or jsonb_array_length(_entries) > 50
     or pg_column_size(_entries) > 131072 then
    raise exception 'Jury ballot must be a bounded non-empty array'
      using errcode = '22023';
  end if;

  return public.v3_submit_jury_ballot_s2_impl(
    _show_id,
    _entries,
    _preflight_id,
    _operation_id,
    _request_hash
  );
end
$jury_submit_gate$;

revoke all on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  from public, anon;
grant execute on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text)
  to authenticated, service_role;

comment on function public.v3_submit_jury_ballot(uuid, jsonb, uuid, uuid, text) is
  'Public participant Jury command gate. Validates bounded ballot shape before delegating to the canonical S2-observed Jury submission implementation.';

-- ---------------------------------------------------------------------------
-- S4/S5 event bridge for the real participant submit command
-- ---------------------------------------------------------------------------

create or replace function private.v3_emit_jury_submission_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $jury_submit_event$
declare
  v_ballot public.jury_ballot_submissions%rowtype;
  v_ballot_id uuid;
  v_result_show_id uuid;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'jury.submit' then
    return new;
  end if;

  begin
    v_ballot_id := nullif(new.result ->> 'ballot_submission_id', '')::uuid;
    v_result_show_id := nullif(new.result ->> 'show_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed participant Jury submission has invalid event provenance'
      using errcode = '23514';
  end;

  if v_ballot_id is null or v_result_show_id is null then
    raise exception 'Completed participant Jury submission lacks event provenance'
      using errcode = '23514';
  end if;

  select ballot.*
  into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.id = v_ballot_id
    and ballot.show_id = v_result_show_id
    and ballot.user_id = new.actor_id;

  if v_ballot.id is null then
    raise exception 'Completed participant Jury submission does not match canonical ballot state'
      using errcode = '23514';
  end if;

  -- Reuse the canonical Jury lifecycle event already owned by S5. Submission is
  -- a ballot lifecycle change; consumers should not need another event taxonomy
  -- merely because the command came from the participant surface.
  perform private.v3_emit_domain_event(
    'jury.ballot_changed',
    'jury_ballot',
    v_ballot.id::text,
    coalesce(v_ballot.review_version, 0),
    new.operation_id,
    v_ballot.edition_id,
    v_ballot.show_id,
    jsonb_build_object(
      'ballotId', v_ballot.id,
      'showId', v_ballot.show_id,
      'status', v_ballot.status,
      'changeKind', 'submitted'
    ),
    1,
    array['jury.tasks']::text[]
  );

  return new;
end
$jury_submit_event$;

revoke all on function private.v3_emit_jury_submission_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_jury_submission_event
  on public.studio2_operation_receipts;
create trigger v3_emit_jury_submission_event
after update of status on public.studio2_operation_receipts
for each row
when (
  old.status is distinct from new.status
  and new.status = 'succeeded'
  and new.command = 'jury.submit'
)
execute function private.v3_emit_jury_submission_event();

notify pgrst, 'reload schema';

commit;

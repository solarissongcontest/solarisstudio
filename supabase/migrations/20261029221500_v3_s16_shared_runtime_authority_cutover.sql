begin;

-- V3 S16 shared runtime authority cutover.
--
-- This migration closes two remaining shared mutation-authority gaps without
-- weakening the catalog gate:
--   * manual Organizer jury-score edits gain an operation/idempotency/CAS/
--     durable-receipt boundary;
--   * the retained participation primitive becomes owner-only and its legacy
--     search_path is pinned before it is structurally certified.
--
-- The legacy jury score RPCs are intentionally kept executable for the browser
-- for one migration so the application can cut over without a broken deploy
-- window. A following forward-only cutover migration revokes that compatibility
-- after the client uses studio2_apply_jury_vote_change.

-- Participation status already has the governed R2 wrapper
-- studio2_apply_participation_status. The old primitive is no longer a trusted
-- service-role mutation authority: trusted callers must invoke the governed RPC.
alter function public.admin_set_participation_status(uuid, uuid, uuid, text)
  set search_path = pg_catalog, public, private, pg_temp;
revoke all on function public.admin_set_participation_status(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_participation_status(uuid, uuid, uuid, text)
  to postgres;

-- This trigger only projects the canonical Entry youtube link into Confirmation.
-- Pin it so S16 can prove the exact trigger mechanism instead of trusting its name.
alter function public.sync_confirmation_entry_youtube_link()
  set search_path = pg_catalog, public, pg_temp;
revoke all on function public.sync_confirmation_entry_youtube_link()
  from public, anon, authenticated, service_role;
grant execute on function public.sync_confirmation_entry_youtube_link()
  to postgres;

-- A show-scoped score version is deliberately narrower than the existing
-- edition-wide jury-window version. Any score-row mutation in the same show
-- invalidates a stale Organizer score preview, while unrelated shows do not.
create table if not exists public.studio2_jury_vote_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_jury_vote_versions enable row level security;
revoke all on table public.studio2_jury_vote_versions
  from public, anon, authenticated, service_role;
grant all on table public.studio2_jury_vote_versions to postgres;

create or replace function private.studio2_touch_jury_vote_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $touch$
declare
  v_new_show_id uuid;
  v_new_edition_id uuid;
  v_old_show_id uuid;
  v_old_edition_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_show_id := new.show_id;
    v_new_edition_id := new.edition_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_show_id := old.show_id;
    v_old_edition_id := old.edition_id;
  end if;

  if v_new_show_id is not null and v_new_edition_id is not null then
    insert into public.studio2_jury_vote_versions (
      show_id, edition_id, version, updated_at
    )
    values (v_new_show_id, v_new_edition_id, 1, now())
    on conflict (show_id) do update
    set
      edition_id = excluded.edition_id,
      version = public.studio2_jury_vote_versions.version + 1,
      updated_at = excluded.updated_at;
  end if;

  if v_old_show_id is not null
     and v_old_edition_id is not null
     and (
       v_new_show_id is distinct from v_old_show_id
       or v_new_edition_id is distinct from v_old_edition_id
     ) then
    insert into public.studio2_jury_vote_versions (
      show_id, edition_id, version, updated_at
    )
    values (v_old_show_id, v_old_edition_id, 1, now())
    on conflict (show_id) do update
    set
      edition_id = excluded.edition_id,
      version = public.studio2_jury_vote_versions.version + 1,
      updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_jury_vote_version()
  from public, anon, authenticated, service_role;
grant execute on function private.studio2_touch_jury_vote_version() to postgres;

drop trigger if exists studio2_jury_vote_touch_version on public.jury_votes;
create trigger studio2_jury_vote_touch_version
after insert or delete or update of
  edition_id,
  show_id,
  voter_id,
  voter_country_id,
  voter_entity_id,
  receiving_country_id,
  receiving_entity_id,
  points,
  ballot_submission_id
on public.jury_votes
for each row execute function private.studio2_touch_jury_vote_version();

create or replace function public.studio2_jury_vote_change_preview(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer,
  p_action text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_show_edition_id uuid;
  v_version bigint := 0;
  v_existing public.jury_votes%rowtype;
begin
  if v_action not in ('assign', 'clear') then
    raise exception 'Unknown jury score action' using errcode = '22023';
  end if;
  if p_edition_id is null or p_show_id is null or p_points is null then
    raise exception 'Edition, show and jury point value are required'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception 'Jury score show belongs to another edition'
      using errcode = '42501';
  end if;
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage'
      using errcode = '42501';
  end if;

  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    case when v_action = 'assign' then p_receiving_country_id else null end,
    case when v_action = 'assign' then p_receiving_entity_id else null end,
    null
  );

  if v_action = 'assign'
     and coalesce(p_receiving_entity_id, p_receiving_country_id) is null then
    raise exception 'A jury score recipient is required' using errcode = '22023';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_jury_vote_versions version_row
    where version_row.show_id = p_show_id
      and version_row.edition_id = p_edition_id
  ), 0)
  into v_version;

  select vote.*
  into v_existing
  from public.jury_votes vote
  where vote.edition_id = p_edition_id
    and vote.show_id = p_show_id
    and coalesce(vote.voter_id, vote.voter_entity_id, vote.voter_country_id)
      = coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id)
    and vote.points = p_points
  order by vote.created_at desc, vote.id desc
  limit 1;

  return jsonb_build_object(
    'riskClass', 'R2',
    'action', v_action,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'expectedVersion', v_version,
    'currentVoteId', v_existing.id,
    'currentReceivingCountryId', v_existing.receiving_country_id,
    'currentReceivingEntityId', v_existing.receiving_entity_id,
    'points', p_points,
    'alreadyApplied', case
      when v_action = 'clear' then v_existing.id is null
      else v_existing.id is not null
        and v_existing.receiving_country_id is not distinct from p_receiving_country_id
        and v_existing.receiving_entity_id is not distinct from p_receiving_entity_id
    end
  );
end
$preview$;

revoke all on function public.studio2_jury_vote_change_preview(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text
) from public, anon;
grant execute on function public.studio2_jury_vote_change_preview(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text
) to authenticated, service_role;

create or replace function public.studio2_apply_jury_vote_change(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer,
  p_action text,
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
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_show_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_vote_id uuid;
  v_deleted integer := 0;
  v_result jsonb;
begin
  if v_action not in ('assign', 'clear') then
    raise exception 'Unknown jury score action' using errcode = '22023';
  end if;
  if p_operation_id is null
     or p_expected_version is null
     or p_expected_version < 0
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Operation id, idempotency key and expected jury score version are required'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception 'Jury score show belongs to another edition'
      using errcode = '42501';
  end if;
  if not public.studio2_access_allowed('jury.ballots.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: jury.ballots.manage'
      using errcode = '42501';
  end if;

  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    case when v_action = 'assign' then p_receiving_country_id else null end,
    case when v_action = 'assign' then p_receiving_entity_id else null end,
    null
  );

  if v_action = 'assign'
     and coalesce(p_receiving_entity_id, p_receiving_country_id) is null then
    raise exception 'A jury score recipient is required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.vote.' || v_action,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'voterId', p_voter_id,
      'voterCountryId', p_voter_country_id,
      'voterEntityId', p_voter_entity_id,
      'receivingCountryId', p_receiving_country_id,
      'receivingEntityId', p_receiving_entity_id,
      'points', p_points,
      'action', v_action,
      'expectedVersion', p_expected_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-jury-votes:' || p_show_id::text, 0)
  );

  insert into public.studio2_jury_vote_versions (
    show_id, edition_id, version, updated_at
  )
  values (p_show_id, p_edition_id, 0, now())
  on conflict (show_id) do nothing;

  select version_row.version
  into v_current_version
  from public.studio2_jury_vote_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id
  for update;

  if not found then
    raise exception 'Jury score version belongs to another edition'
      using errcode = '42501';
  end if;
  if p_expected_version is distinct from v_current_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  -- Re-run the impact preflight inside the authoritative transaction. Preview
  -- is evidence for the user, never permission for the later mutation.
  perform public.studio2_jury_vote_change_preview(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    p_receiving_country_id,
    p_receiving_entity_id,
    p_points,
    v_action
  );

  if v_action = 'assign' then
    v_vote_id := public.assign_jury_vote(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_receiving_country_id,
      p_receiving_entity_id,
      p_points
    );
  else
    v_deleted := public.clear_jury_point(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_points
    );
  end if;

  select version_row.version
  into v_next_version
  from public.studio2_jury_vote_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'jury_vote_' || v_action,
    'jury_votes',
    coalesce(v_vote_id::text, p_show_id::text),
    jsonb_build_object(
      'showId', p_show_id,
      'points', p_points,
      'expectedVersion', p_expected_version
    ),
    jsonb_build_object(
      'showId', p_show_id,
      'points', p_points,
      'voteId', v_vote_id,
      'deletedRows', v_deleted,
      'version', coalesce(v_next_version, v_current_version),
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'operationId', v_operation_id,
    'action', v_action,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'points', p_points,
    'voteId', v_vote_id,
    'deletedRows', v_deleted,
    'previousVersion', v_current_version,
    'version', coalesce(v_next_version, v_current_version)
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_jury_vote_change(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_vote_change(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, uuid, text, bigint
) to authenticated, service_role;

comment on function public.studio2_apply_jury_vote_change(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, uuid, text, bigint
) is
  'Canonical Organizer jury-score mutation command with scoped authorization, show-level CAS, semantic idempotency and durable operation readback.';

notify pgrst, 'reload schema';

commit;

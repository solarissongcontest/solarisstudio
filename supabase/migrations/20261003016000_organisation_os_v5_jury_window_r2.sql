begin;

-- Organisation OS V5: governed Jury voting-window transitions.
--
-- Opening/closing a country-account Jury window is Risk R2. The operation is
-- bound to an edition-level voting-window version. Ballot insertion uses the
-- same version lock before validating that the window is still open, which
-- prevents a last-second ballot from committing after an acknowledged close.

alter table public.jury_voting_windows
  add column if not exists operation_version bigint not null default 0
    check (operation_version >= 0);

create table if not exists public.studio2_jury_window_versions (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_jury_window_versions enable row level security;
revoke all on table public.studio2_jury_window_versions
  from public, anon, authenticated;
grant all on table public.studio2_jury_window_versions to service_role;

create or replace function private.studio2_bump_jury_window_version(
  p_edition_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
declare
  v_version bigint;
begin
  insert into public.studio2_jury_window_versions (
    edition_id,
    version,
    updated_at
  )
  values (
    p_edition_id,
    1,
    now()
  )
  on conflict (edition_id) do update
    set version = public.studio2_jury_window_versions.version + 1,
        updated_at = now()
  returning version into v_version;

  return v_version;
end
$bump$;

revoke all on function private.studio2_bump_jury_window_version(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_window_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $window_version$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op = 'INSERT' then
    perform private.studio2_bump_jury_window_version(new.edition_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.studio2_bump_jury_window_version(old.edition_id);
    return old;
  end if;

  v_old_edition := old.edition_id;
  v_new_edition := new.edition_id;

  if
    (to_jsonb(new) - array['operation_version', 'updated_at']::text[])
    is distinct from
    (to_jsonb(old) - array['operation_version', 'updated_at']::text[])
  then
    new.operation_version := old.operation_version + 1;
  end if;

  if new.operation_version is distinct from old.operation_version then
    perform private.studio2_bump_jury_window_version(v_new_edition);
    if v_old_edition is distinct from v_new_edition then
      perform private.studio2_bump_jury_window_version(v_old_edition);
    end if;
  end if;

  return new;
end
$window_version$;

-- operation_version must be adjusted before the row is stored; the edition
-- version bump is separate after-write work.
create or replace function private.studio2_jury_window_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $before$
begin
  if
    (to_jsonb(new) - array['operation_version', 'updated_at']::text[])
    is distinct from
    (to_jsonb(old) - array['operation_version', 'updated_at']::text[])
  then
    new.operation_version := old.operation_version + 1;
  end if;
  return new;
end
$before$;

revoke all on function private.studio2_jury_window_before_update()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_window_before_update
  on public.jury_voting_windows;
create trigger studio2_jury_window_before_update
before update on public.jury_voting_windows
for each row execute function private.studio2_jury_window_before_update();

-- Keep the after trigger focused on edition-version invalidation.
create or replace function private.studio2_jury_window_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $after$
begin
  if tg_op = 'INSERT' then
    perform private.studio2_bump_jury_window_version(new.edition_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.studio2_bump_jury_window_version(old.edition_id);
    return old;
  end if;

  if new.operation_version is distinct from old.operation_version then
    perform private.studio2_bump_jury_window_version(new.edition_id);
    if old.edition_id is distinct from new.edition_id then
      perform private.studio2_bump_jury_window_version(old.edition_id);
    end if;
  end if;

  return new;
end
$after$;

revoke all on function private.studio2_jury_window_after_write()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_window_after_write
  on public.jury_voting_windows;
create trigger studio2_jury_window_after_write
after insert or update or delete on public.jury_voting_windows
for each row execute function private.studio2_jury_window_after_write();

-- Raw browser writes can otherwise bypass the impact preview because existing
-- Permission Engine RLS intentionally allows voting.manage to mutate this row.
create or replace function private.studio2_guard_jury_window_direct_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception
      'Jury voting-window changes must use the governed R2 command.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_guard_jury_window_direct_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_jury_window_direct_write
  on public.jury_voting_windows;
create trigger studio2_guard_jury_window_direct_write
before insert or update or delete on public.jury_voting_windows
for each row execute function private.studio2_guard_jury_window_direct_write();

-- Country-account ballot submission participates in the same concurrency
-- protocol. Lock the edition version first, then the window row. The R2 status
-- command takes locks in the same order, avoiding deadlocks.
create or replace function private.studio2_jury_ballot_window_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $ballot_guard$
declare
  v_edition_id uuid;
  v_window_status text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  v_edition_id := new.edition_id;

  insert into public.studio2_jury_window_versions (
    edition_id,
    version,
    updated_at
  )
  values (
    v_edition_id,
    0,
    now()
  )
  on conflict (edition_id) do nothing;

  perform version
  from public.studio2_jury_window_versions
  where edition_id = v_edition_id
  for update;

  select window.status
  into v_window_status
  from public.jury_voting_windows window
  where window.show_id = new.show_id
    and window.edition_id = v_edition_id
  for share;

  if v_window_status is distinct from 'open' then
    raise exception
      'Jury voting closed before this ballot was committed. Reopen the booth before submitting.'
      using errcode = '55000';
  end if;

  perform private.studio2_bump_jury_window_version(v_edition_id);

  return new;
end
$ballot_guard$;

revoke all on function private.studio2_jury_ballot_window_guard()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_ballot_window_guard
  on public.jury_ballot_submissions;
create trigger studio2_jury_ballot_window_guard
before insert on public.jury_ballot_submissions
for each row execute function private.studio2_jury_ballot_window_guard();

create or replace function private.studio2_jury_window_snapshot(
  p_show_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_show public.shows%rowtype;
  v_status text := 'closed';
  v_version bigint := 0;
  v_participant_count integer := 0;
  v_point_count integer := 0;
  v_jury_enabled boolean := true;
  v_allow_self boolean := false;
  v_participating_roster_count integer := 0;
  v_expected_voters integer := 0;
  v_completed_ballots integer := 0;
  v_missing_ballots integer := 0;
  v_other_open jsonb := '[]'::jsonb;
  v_blockers text[] := array[]::text[];
  v_preconditions jsonb := '{}'::jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Jury voting status must be open or closed'
      using errcode = '22023';
  end if;

  select *
  into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  select coalesce(window.status, 'closed')
  into v_status
  from public.jury_voting_windows window
  where window.show_id = p_show_id;

  v_status := coalesce(v_status, 'closed');

  select coalesce(subject.version, 0)
  into v_version
  from public.studio2_jury_window_versions subject
  where subject.edition_id = v_show.edition_id;

  v_version := coalesce(v_version, 0);

  v_jury_enabled :=
    coalesce((v_show.voting_config ->> 'juryEnabled')::boolean, true);
  v_allow_self :=
    coalesce((v_show.voting_config ->> 'allowSelfVote')::boolean, false);

  v_point_count := jsonb_array_length(
    coalesce(
      v_show.voting_config -> 'juryPoints',
      '[12,10,8,7,6,5,4,3,2,1]'::jsonb
    )
  );

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and (
      participant.participation_status is null
      or participant.participation_status = 'confirmed'
    );

  if exists (
    select 1 from public.voters voter where voter.show_id = p_show_id
  ) then
    select count(*)::integer
    into v_expected_voters
    from public.voters voter
    where voter.show_id = p_show_id;

    select count(*)::integer
    into v_participating_roster_count
    from public.voters voter
    where voter.show_id = p_show_id
      and exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and participant.country_id = voter.country_id
          and (
            participant.participation_status is null
            or participant.participation_status = 'confirmed'
          )
      );
  else
    v_expected_voters := v_participant_count;
  end if;

  with roster as (
    select voter.country_id
    from public.voters voter
    where voter.show_id = p_show_id

    union all

    select participant.country_id
    from public.participants participant
    where participant.show_id = p_show_id
      and (
        participant.participation_status is null
        or participant.participation_status = 'confirmed'
      )
      and not exists (
        select 1 from public.voters voter where voter.show_id = p_show_id
      )
  ),
  completed as (
    select roster.country_id
    from roster
    where
      exists (
        select 1
        from public.jury_ballot_statuses ballot_status
        where ballot_status.show_id = p_show_id
          and ballot_status.status = 'did_not_vote'
          and ballot_status.voter_country_id = roster.country_id
      )
      or (
        select count(*)
        from public.jury_votes vote
        where vote.show_id = p_show_id
          and vote.voter_country_id = roster.country_id
      ) >= v_point_count
  )
  select count(*)::integer
  into v_completed_ballots
  from completed;

  v_missing_ballots := greatest(v_expected_voters - v_completed_ballots, 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'showId', window.show_id,
        'showName', other_show.name
      )
      order by other_show.sort_order, other_show.name
    ),
    '[]'::jsonb
  )
  into v_other_open
  from public.jury_voting_windows window
  join public.shows other_show on other_show.id = window.show_id
  where window.edition_id = v_show.edition_id
    and window.show_id <> p_show_id
    and window.status = 'open';

  if p_status = 'open' and not v_jury_enabled then
    v_blockers := array_append(
      v_blockers,
      'Jury voting is disabled for this show.'
    );
  end if;

  if p_status = 'open' and v_participant_count < v_point_count then
    v_blockers := array_append(
      v_blockers,
      'This show does not have enough entries for the configured jury point scale.'
    );
  end if;

  if p_status = 'open'
     and not v_allow_self
     and v_participant_count = v_point_count
     and v_participating_roster_count > 0 then
    v_blockers := array_append(
      v_blockers,
      'The configured jury scale leaves participating juries too few eligible entries after self-voting is blocked.'
    );
  end if;

  v_preconditions := private.studio2_result_preconditions(p_show_id);

  if p_status = 'open'
     and coalesce((v_preconditions ->> 'publishedResults')::boolean, false) then
    v_blockers := array_append(
      v_blockers,
      'Make published results private before reopening jury voting.'
    );
  end if;

  if p_status = 'open'
     and exists (
       select 1
       from public.studio2_result_operations operation
       where operation.show_id = p_show_id
         and operation.calculation_version > 0
         and (
           operation.locked_version = operation.calculation_version
           or operation.reveal_ready_version = operation.calculation_version
         )
     ) then
    v_blockers := array_append(
      v_blockers,
      'Unlock the current result version before reopening jury voting.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'showId', v_show.id,
    'showName', v_show.name,
    'editionId', v_show.edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_status,
    'expectedVersion', v_version,
    'submittedBallots', v_completed_ballots,
    'expectedBallots', v_expected_voters,
    'missingBallots', v_missing_ballots,
    'otherOpenWindows', v_other_open,
    'alreadyApplied', v_status = p_status,
    'blockers', to_jsonb(v_blockers)
  );
end
$snapshot$;

revoke all on function private.studio2_jury_window_snapshot(uuid, text)
  from public, anon, authenticated;

create or replace function public.studio2_jury_window_change_preview(
  p_show_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_edition_id uuid;
begin
  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  return private.studio2_jury_window_snapshot(p_show_id, p_status);
end
$preview$;

revoke all on function public.studio2_jury_window_change_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_jury_window_change_preview(uuid, text)
  to authenticated;

create or replace function public.studio2_apply_jury_voting_status(
  p_show_id uuid,
  p_status text,
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
  v_actor uuid := auth.uid();
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint;
  v_snapshot jsonb;
  v_blockers jsonb;
  v_previous_status text := 'closed';
  v_other_closed integer := 0;
  v_after_version bigint;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_show_id is null
     or p_operation_id is null
     or p_expected_version is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception
      'Show, operation identity and expected version are required'
      using errcode = '22023';
  end if;

  if p_status not in ('open', 'closed') then
    raise exception 'Jury voting status must be open or closed'
      using errcode = '22023';
  end if;

  select *
  into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_show.edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.window.status.change',
    'R2',
    jsonb_build_object(
      'showId', p_show_id,
      'editionId', v_show.edition_id,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.studio2_jury_window_versions (
    edition_id,
    version,
    updated_at
  )
  values (
    v_show.edition_id,
    0,
    now()
  )
  on conflict (edition_id) do nothing;

  select version
  into v_current_version
  from public.studio2_jury_window_versions
  where edition_id = v_show.edition_id
  for update;

  if v_current_version is distinct from p_expected_version then
    raise exception
      'Jury voting state changed since this impact preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  -- Lock every window in the edition after the version row. Ballot insertion
  -- uses version -> target window in the same order.
  perform 1
  from public.jury_voting_windows window
  where window.edition_id = v_show.edition_id
  order by window.show_id
  for update;

  v_snapshot := private.studio2_jury_window_snapshot(
    p_show_id,
    p_status
  );
  v_blockers := coalesce(v_snapshot -> 'blockers', '[]'::jsonb);

  if jsonb_array_length(v_blockers) > 0 then
    raise exception '%', (
      select string_agg(value, ' ')
      from jsonb_array_elements_text(v_blockers)
    ) using errcode = '55000';
  end if;

  select coalesce(window.status, 'closed')
  into v_previous_status
  from public.jury_voting_windows window
  where window.show_id = p_show_id;

  v_previous_status := coalesce(v_previous_status, 'closed');

  if p_status = 'open' then
    update public.jury_voting_windows
    set
      status = 'closed',
      closed_at = now(),
      updated_at = now()
    where edition_id = v_show.edition_id
      and show_id <> p_show_id
      and status = 'open';

    get diagnostics v_other_closed = row_count;
  end if;

  insert into public.jury_voting_windows (
    show_id,
    edition_id,
    status,
    opened_at,
    closed_at,
    opened_by,
    updated_at
  )
  values (
    p_show_id,
    v_show.edition_id,
    p_status,
    case when p_status = 'open' then now() else null end,
    case when p_status = 'closed' then now() else null end,
    case when p_status = 'open' then v_actor else null end,
    now()
  )
  on conflict (show_id) do update
    set
      edition_id = excluded.edition_id,
      status = excluded.status,
      opened_at = case
        when excluded.status = 'open' then now()
        else public.jury_voting_windows.opened_at
      end,
      closed_at = case
        when excluded.status = 'closed' then now()
        else null
      end,
      opened_by = case
        when excluded.status = 'open' then v_actor
        else public.jury_voting_windows.opened_by
      end,
      updated_at = now();

  select version
  into v_after_version
  from public.studio2_jury_window_versions
  where edition_id = v_show.edition_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'jury_window_status_change',
    'jury_voting_windows',
    p_show_id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'version', p_expected_version
    ),
    jsonb_build_object(
      'status', p_status,
      'version', v_after_version,
      'operationId', v_operation_id,
      'riskClass', 'R2',
      'completedBallots',
        coalesce((v_snapshot ->> 'submittedBallots')::integer, 0),
      'missingBallots',
        coalesce((v_snapshot ->> 'missingBallots')::integer, 0),
      'otherWindowsClosed', v_other_closed
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'showId', p_show_id,
    'previousStatus', v_previous_status,
    'status', p_status,
    'version', v_after_version,
    'otherWindowsClosed', v_other_closed,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_jury_voting_status(
  uuid,
  text,
  uuid,
  text,
  bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_voting_status(
  uuid,
  text,
  uuid,
  text,
  bigint
) to authenticated;

-- Browser Organizers may no longer use the legacy direct status RPC.
revoke execute on function public.admin_set_jury_voting_status(uuid, text)
  from authenticated;
grant execute on function public.admin_set_jury_voting_status(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;

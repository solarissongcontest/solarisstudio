begin;

-- Organisation OS V5: governed Televoting round-state transitions.
--
-- Opening, closing, reopening or returning a round to draft is an R2 command.
-- The preflight snapshot is bound to both a global voting version and the
-- individual round version so concurrent line-up/state edits cannot be silently
-- overwritten. Direct status writes are rejected outside this command.

alter table televoting.rounds
  add column if not exists operation_version bigint not null default 0
    check (operation_version >= 0);

create table if not exists televoting.round_operation_state (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into televoting.round_operation_state (id, version)
values (1, 0)
on conflict (id) do nothing;

alter table televoting.round_operation_state enable row level security;
revoke all on table televoting.round_operation_state from public, anon, authenticated;
grant all on table televoting.round_operation_state to service_role;

create or replace function televoting.studio2_bump_round_global_version()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $global$
begin
  insert into televoting.round_operation_state (id, version, updated_at)
  values (1, 1, now())
  on conflict (id) do update
    set version = televoting.round_operation_state.version + 1,
        updated_at = now();
end
$global$;

revoke all on function televoting.studio2_bump_round_global_version()
  from public, anon, authenticated;

create or replace function televoting.studio2_round_version_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $round_version$
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
$round_version$;

revoke all on function televoting.studio2_round_version_before_update()
  from public, anon, authenticated;

drop trigger if exists studio2_round_operation_version_before_update
  on televoting.rounds;
create trigger studio2_round_operation_version_before_update
before update on televoting.rounds
for each row execute function televoting.studio2_round_version_before_update();

create or replace function televoting.studio2_round_global_version_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $round_global$
begin
  if tg_op = 'INSERT' then
    perform televoting.studio2_bump_round_global_version();
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform televoting.studio2_bump_round_global_version();
    return old;
  end if;

  if new.operation_version is distinct from old.operation_version then
    perform televoting.studio2_bump_round_global_version();
  end if;

  return new;
end
$round_global$;

revoke all on function televoting.studio2_round_global_version_after_write()
  from public, anon, authenticated;

drop trigger if exists studio2_round_global_version_after_write
  on televoting.rounds;
create trigger studio2_round_global_version_after_write
after insert or update or delete on televoting.rounds
for each row execute function televoting.studio2_round_global_version_after_write();

create or replace function televoting.studio2_round_entry_version_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $entry_version$
declare
  v_old_round uuid;
  v_new_round uuid;
begin
  v_old_round := case when tg_op in ('UPDATE', 'DELETE') then old.round_id else null end;
  v_new_round := case when tg_op in ('INSERT', 'UPDATE') then new.round_id else null end;

  if v_old_round is not null then
    update televoting.rounds
    set operation_version = operation_version + 1,
        updated_at = now()
    where id = v_old_round;
  end if;

  if v_new_round is not null and v_new_round is distinct from v_old_round then
    update televoting.rounds
    set operation_version = operation_version + 1,
        updated_at = now()
    where id = v_new_round;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$entry_version$;

revoke all on function televoting.studio2_round_entry_version_after_write()
  from public, anon, authenticated;

drop trigger if exists studio2_round_entry_operation_version
  on televoting.round_entries;
create trigger studio2_round_entry_operation_version
after insert or update or delete on televoting.round_entries
for each row execute function televoting.studio2_round_entry_version_after_write();

create or replace function televoting.studio2_guard_round_status_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, televoting
as $guard$
declare
  v_governed boolean :=
    coalesce(current_setting('solaris.round_status_command', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not v_governed then
      raise exception 'Round status changes must use the governed R2 command.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not v_governed then
      if old.status <> 'draft' then
        raise exception 'Only unused draft rounds can be deleted.'
          using errcode = '42501';
      end if;

      if old.calculation_version > 0
         or exists (
           select 1
           from televoting.vote_submissions submission
           where submission.round_id = old.id
             and submission.status <> 'deleted'
         )
         or exists (
           select 1
           from televoting.round_results result_row
           where result_row.round_id = old.id
         ) then
        raise exception
          'This draft has voting or result history and cannot be deleted. Keep it in history instead.'
          using errcode = '55000';
      end if;
    end if;

    return old;
  end if;

  if (
    new.status is distinct from old.status
    or new.opened_at is distinct from old.opened_at
    or new.closed_at is distinct from old.closed_at
  ) and not v_governed then
    raise exception 'Round status changes must use the governed R2 command.'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function televoting.studio2_guard_round_status_write()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_round_status_write
  on televoting.rounds;
create trigger studio2_guard_round_status_write
before insert or update or delete on televoting.rounds
for each row execute function televoting.studio2_guard_round_status_write();

create or replace function televoting.studio2_round_canonical_edition(
  p_round_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $edition$
  select coalesce(binding.edition_id, edition_link.solaris_id)
  from televoting.rounds round_row
  left join public.televoting_round_bindings binding
    on binding.remote_round_id = round_row.id::text
  left join public.integration_links edition_link
    on edition_link.service = 'televoting'
   and edition_link.entity_type = 'edition'
   and edition_link.remote_id = round_row.edition_id::text
  where round_row.id = p_round_id
  limit 1;
$edition$;

revoke all on function televoting.studio2_round_canonical_edition(uuid)
  from public, anon, authenticated;

create or replace function televoting.studio2_round_status_snapshot(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $snapshot$
declare
  v_round televoting.rounds%rowtype;
  v_global_version bigint := 0;
  v_solaris_edition uuid;
  v_entry_count integer := 0;
  v_ballot_count integer := 0;
  v_suspicious_count integer := 0;
  v_other_open record;
  v_blockers text[] := array[]::text[];
begin
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid voting round status: %', p_status
      using errcode = '22023';
  end if;

  select *
  into v_round
  from televoting.rounds
  where id = p_round_id;

  if not found then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select version
  into v_global_version
  from televoting.round_operation_state
  where id = 1;

  v_global_version := coalesce(v_global_version, 0);
  v_solaris_edition := televoting.studio2_round_canonical_edition(p_round_id);

  select count(*)::integer
  into v_entry_count
  from televoting.round_entries
  where round_id = p_round_id;

  select
    count(*) filter (where submission.status <> 'deleted')::integer,
    count(*) filter (where submission.status = 'suspicious')::integer
  into v_ballot_count, v_suspicious_count
  from televoting.vote_submissions submission
  where submission.round_id = p_round_id;

  select other.id, other.name, other.edition_id
  into v_other_open
  from televoting.rounds other
  where other.status = 'open'
    and other.id <> p_round_id
  order by other.opened_at desc nulls last, other.created_at desc
  limit 1;

  if p_status = 'open' and (v_entry_count < 2 or v_entry_count > 50) then
    v_blockers := array_append(
      v_blockers,
      'Voting requires between 2 and 50 configured entries.'
    );
  end if;

  if p_status = 'open' and v_other_open.id is not null then
    v_blockers := array_append(
      v_blockers,
      'Another public voting round is already open.'
    );
  end if;

  if p_status = 'open' and v_round.results_status in ('locked', 'published') then
    v_blockers := array_append(
      v_blockers,
      'Unlock or unpublish the current Televoting result before reopening voting.'
    );
  end if;

  if p_status = 'draft' and v_round.results_status in ('locked', 'published') then
    v_blockers := array_append(
      v_blockers,
      'Unlock or unpublish the current Televoting result before returning this round to draft.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition,
    'requestedStatus', p_status,
    'currentStatus', v_round.status,
    'expectedGlobalVersion', v_global_version,
    'expectedRoundVersion', v_round.operation_version,
    'entryCount', v_entry_count,
    'ballotCount', coalesce(v_ballot_count, 0),
    'suspiciousBallotCount', coalesce(v_suspicious_count, 0),
    'resultsStatus', v_round.results_status,
    'calculationVersion', v_round.calculation_version,
    'resultsOutdated', v_round.results_outdated,
    'otherOpenRound',
      case
        when v_other_open.id is null then null
        else jsonb_build_object(
          'roundId', v_other_open.id,
          'roundName', v_other_open.name,
          'editionId', v_other_open.edition_id
        )
      end,
    'blockers', to_jsonb(v_blockers),
    'alreadyApplied', v_round.status::text = p_status
  );
end
$snapshot$;

revoke all on function televoting.studio2_round_status_snapshot(uuid, text)
  from public, anon, authenticated;

create or replace function televoting.studio2_round_status_change_preview(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $preview$
declare
  v_edition_id uuid;
begin
  v_edition_id := televoting.studio2_round_canonical_edition(p_round_id);

  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  return televoting.studio2_round_status_snapshot(p_round_id, p_status);
end
$preview$;

revoke all on function televoting.studio2_round_status_change_preview(uuid, text)
  from public, anon;
grant execute on function televoting.studio2_round_status_change_preview(uuid, text)
  to authenticated;

create or replace function televoting.studio2_apply_round_status_change(
  p_round_id uuid,
  p_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_global_version bigint,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_actor uuid := auth.uid();
  v_actor_label text := coalesce(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'display_name',
    auth.uid()::text
  );
  v_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_round televoting.rounds%rowtype;
  v_global_version bigint;
  v_snapshot jsonb;
  v_blockers jsonb;
  v_previous_status text;
  v_after_round_version bigint;
  v_after_global_version bigint;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_round_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_global_version is null
     or p_expected_round_version is null then
    raise exception 'Round, operation identity and expected versions are required'
      using errcode = '22023';
  end if;

  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid voting round status: %', p_status
      using errcode = '22023';
  end if;

  v_edition_id := televoting.studio2_round_canonical_edition(p_round_id);

  if not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'televoting.round.status.change',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'editionId', v_edition_id,
      'requestedStatus', p_status,
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select version
  into v_global_version
  from televoting.round_operation_state
  where id = 1
  for update;

  select *
  into v_round
  from televoting.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  if v_global_version is distinct from p_expected_global_version
     or v_round.operation_version is distinct from p_expected_round_version then
    raise exception
      'Voting round state changed since this impact preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_snapshot := televoting.studio2_round_status_snapshot(p_round_id, p_status);
  v_blockers := coalesce(v_snapshot -> 'blockers', '[]'::jsonb);

  if jsonb_array_length(v_blockers) > 0 then
    raise exception '%', (
      select string_agg(value, ' ')
      from jsonb_array_elements_text(v_blockers)
    ) using errcode = '55000';
  end if;

  v_previous_status := v_round.status::text;

  if v_previous_status <> p_status then
    perform set_config('solaris.round_status_command', '1', true);

    if p_status = 'open' then
      update televoting.rounds
      set
        status = 'open',
        opened_at = now(),
        closed_at = null,
        results_outdated = results_outdated or calculation_version > 0
      where id = p_round_id;
    elsif p_status = 'closed' then
      update televoting.rounds
      set
        status = 'closed',
        closed_at = now()
      where id = p_round_id;
    else
      update televoting.rounds
      set status = 'draft'
      where id = p_round_id;
    end if;

    if p_status = 'open' then
      update public.televoting_round_bindings
      set frozen_at = now(),
          updated_at = now()
      where remote_round_id = p_round_id::text;
    elsif p_status = 'draft' then
      update public.televoting_round_bindings
      set frozen_at = null,
          updated_at = now()
      where remote_round_id = p_round_id::text;
    end if;
  end if;

  select operation_version
  into v_after_round_version
  from televoting.rounds
  where id = p_round_id;

  select version
  into v_after_global_version
  from televoting.round_operation_state
  where id = 1;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values,
    reason
  )
  values (
    v_actor,
    v_actor_label,
    'round_status_change',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'globalVersion', p_expected_global_version,
      'roundVersion', p_expected_round_version
    ),
    jsonb_build_object(
      'status', p_status,
      'globalVersion', v_after_global_version,
      'roundVersion', v_after_round_version,
      'operationId', v_operation_id,
      'riskClass', 'R2'
    ),
    'Governed Organisation OS V5 round-state transition'
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', v_previous_status <> p_status,
    'riskClass', 'R2',
    'roundId', p_round_id,
    'previousStatus', v_previous_status,
    'status', p_status,
    'globalVersion', v_after_global_version,
    'roundVersion', v_after_round_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_status_change(
  uuid,
  text,
  uuid,
  text,
  bigint,
  bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_status_change(
  uuid,
  text,
  uuid,
  text,
  bigint,
  bigint
) to authenticated;

notify pgrst, 'reload schema';

commit;

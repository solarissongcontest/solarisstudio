begin;

-- S13 contract: forward-only Confirmation/National Final safety repair. This
-- introduces staged participant winner intent and no automatic bulk backfill.
-- Production may intentionally lag the S13 migration-contract framework, so
-- keep the canonical literal registration call while executing it only when
-- that framework exists.
do $contract$
begin
  if to_regprocedure(
       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
     ) is not null then
    execute $registration$
      select public.v3_register_migration_contract(
        'v3.confirmation.pending-nf-winner-review',
        1,
        'forward_fix_only',
        false,
        null,
        'Separate participant-declared National Final winner intent from the canonical exact-version-reviewed winner so Confirmation edits can be saved without weakening Organizer review or publication invariants.'
      )
    $registration$;
  end if;
end
$contract$;

-- Participant Confirmation writes must be able to declare a National Final
-- winner before the exact entry revision has been reviewed. Keep that intent
-- separate from the canonical reviewed winner so unpublished/unreviewed data
-- cannot bypass the exact-version review invariant.
alter table public.national_finals
  add column if not exists pending_winning_entry_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.national_finals'::regclass
      and conname = 'national_finals_pending_winning_entry_id_fkey'
  ) then
    alter table public.national_finals
      add constraint national_finals_pending_winning_entry_id_fkey
      foreign key (pending_winning_entry_id)
      references public.national_final_entries(id)
      on delete set null;
  end if;
end
$$;

create or replace function private.v3_guard_pending_nf_winner_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate public.national_final_entries;
begin
  if new.pending_winning_entry_id is null then
    return new;
  end if;

  select *
  into candidate
  from public.national_final_entries
  where id = new.pending_winning_entry_id;

  if candidate.id is null
     or candidate.national_final_id is distinct from new.id
     or coalesce(candidate.removed, false) then
    raise exception 'Pending National Final winner must be an active entry from the same National Final'
      using errcode = '22023';
  end if;

  return new;
end;
$$;
revoke all on function private.v3_guard_pending_nf_winner_scope() from public, anon, authenticated;

drop trigger if exists v3_guard_pending_nf_winner_scope on public.national_finals;
create trigger v3_guard_pending_nf_winner_scope
before insert or update on public.national_finals
for each row execute function private.v3_guard_pending_nf_winner_scope();

-- Mark only the canonical participant Confirmation command. The exact-review
-- guard can then stage participant intent without changing the semantics of
-- Organizer/manual winner commands, which must continue to reject unreviewed
-- winner versions.
create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_mode text;
  v_previous_participant_context text;
  v_result jsonb;
begin
  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  if v_mode = 'maintenance' then
    raise exception 'Solaris is currently maintenance, so Confirmation writes are unavailable'
      using errcode = '25006';
  end if;

  if v_mode = 'read_only'
     and nullif(btrim(coalesce(payload ->> 'edit_token_hash', '')), '') is null then
    raise exception 'Read-only Confirmation writes require an existing-response edit token'
      using errcode = '25006';
  end if;

  v_previous_participant_context := current_setting(
    'solaris.v3_confirmation_participant_write',
    true
  );
  perform set_config('solaris.v3_confirmation_participant_write', 'on', true);

  begin
    v_result := public.v3_submit_confirmation_core(
      payload,
      _idempotency_key,
      _request_hash,
      _browser_session_id
    );
  exception when others then
    perform set_config(
      'solaris.v3_confirmation_participant_write',
      coalesce(v_previous_participant_context, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'solaris.v3_confirmation_participant_write',
    coalesce(v_previous_participant_context, ''),
    true
  );
  return v_result;
end;
$$;

-- If a participant edits the content of the currently reviewed winner, clear
-- the effective winner inside the same transaction before the version-binding
-- trigger runs. The final Confirmation write will either restore an already
-- reviewed exact version or stage the participant's winner intent for review.
create or replace function private.v3_stage_current_nf_winner_before_participant_entry_edit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(current_setting('solaris.v3_confirmation_participant_write', true), '') <> 'on' then
    return new;
  end if;

  if private.v3_entry_content(to_jsonb(new)) is distinct from private.v3_entry_content(to_jsonb(old))
     and exists (
       select 1
       from public.national_finals nf
       where nf.id = old.national_final_id
         and nf.winning_entry_id = old.id
     ) then
    update public.national_finals nf
    set winning_entry_id = null
    where nf.id = old.national_final_id
      and nf.winning_entry_id = old.id;
  end if;

  return new;
end;
$$;
revoke all on function private.v3_stage_current_nf_winner_before_participant_entry_edit() from public, anon, authenticated;

drop trigger if exists v3_00_stage_current_nf_winner_before_participant_entry_edit
  on public.national_final_entries;
create trigger v3_00_stage_current_nf_winner_before_participant_entry_edit
before update on public.national_final_entries
for each row execute function private.v3_stage_current_nf_winner_before_participant_entry_edit();

-- Preserve the exact-version winner invariant. Participant Confirmation writes
-- that select an unreviewed exact version are staged instead of rejected; every
-- other caller retains the strict rejection behavior.
create or replace function private.v3_guard_exact_reviewed_winner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  candidate public.national_final_entries;
  participant_write boolean :=
    coalesce(current_setting('solaris.v3_confirmation_participant_write', true), '') = 'on';
begin
  if new.submission_id is null then
    return new;
  end if;

  if new.winning_entry_id is null then
    if participant_write then
      new.pending_winning_entry_id := null;
    end if;
    return new;
  end if;

  -- Existing canonical winners created before exact-version review binding are
  -- not reinterpreted retroactively. Only a winner transition requires fresh
  -- exact-version proof, matching the original guard semantics.
  if tg_op = 'UPDATE'
     and new.winning_entry_id is not distinct from old.winning_entry_id then
    return new;
  end if;

  select *
  into candidate
  from public.national_final_entries
  where id = new.winning_entry_id
  for update;

  if candidate.id is null
     or candidate.national_final_id is distinct from new.id
     or coalesce(candidate.removed, false)
     or candidate.current_version_id is null then
    raise exception 'Review the exact current National Final entry version before selecting it as winner'
      using errcode = '22023';
  end if;

  if candidate.review_status = 'accepted'
     and candidate.reviewed_version_id is not distinct from candidate.current_version_id then
    if participant_write then
      new.pending_winning_entry_id := null;
    end if;
    return new;
  end if;

  if participant_write then
    new.pending_winning_entry_id := new.winning_entry_id;
    new.winning_entry_id := case
      when tg_op = 'UPDATE' then old.winning_entry_id
      else null
    end;

    -- A legacy accepted flag without exact-version evidence is not enough to
    -- promote a winner, but it must become visible in the Organizer review
    -- queue once the participant explicitly selects it.
    update public.national_final_entries
    set review_status = 'pending',
        review_reason = null,
        reviewed_at = null,
        reviewed_by = null
    where id = candidate.id
      and (
        review_status is distinct from 'pending'
        or reviewed_version_id is not null
        or review_reason is not null
        or reviewed_at is not null
        or reviewed_by is not null
      );

    return new;
  end if;

  raise exception 'Review the exact current National Final entry version before selecting it as winner'
    using errcode = '22023';
end;
$$;
revoke all on function private.v3_guard_exact_reviewed_winner() from public, anon, authenticated;

-- Once an Organizer accepts the exact pending version, promote the participant
-- declaration to the canonical reviewed winner atomically. Removed entries can
-- never remain pending winner intent.
create or replace function private.v3_promote_pending_nf_winner_after_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(new.removed, false) then
    update public.national_finals nf
    set pending_winning_entry_id = null
    where nf.id = new.national_final_id
      and nf.pending_winning_entry_id = new.id;
    return new;
  end if;

  if new.review_status = 'accepted'
     and new.current_version_id is not null
     and new.reviewed_version_id is not distinct from new.current_version_id then
    update public.national_finals nf
    set winning_entry_id = new.id,
        pending_winning_entry_id = null
    where nf.id = new.national_final_id
      and nf.pending_winning_entry_id = new.id;
  end if;

  return new;
end;
$$;
revoke all on function private.v3_promote_pending_nf_winner_after_review() from public, anon, authenticated;

drop trigger if exists v3_promote_pending_nf_winner_after_review
  on public.national_final_entries;
create trigger v3_promote_pending_nf_winner_after_review
after update of review_status, reviewed_version_id, removed on public.national_final_entries
for each row execute function private.v3_promote_pending_nf_winner_after_review();

commit;

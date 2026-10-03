begin;

-- Organisation OS V5 selection-review and National Final winner transitions.
-- Replaces legacy unversioned confirmation review RPCs with server-authoritative,
-- replay-safe operations bound to one canonical submission review version.

create table if not exists public.studio2_confirmation_review_versions (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_confirmation_review_versions (submission_id, version)
select submission.id, 1
from public.submissions submission
on conflict (submission_id) do nothing;

alter table public.studio2_confirmation_review_versions enable row level security;
revoke all on table public.studio2_confirmation_review_versions
  from public, anon, authenticated;
grant all on table public.studio2_confirmation_review_versions to service_role;

create or replace function private.studio2_touch_confirmation_review_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_submission_id uuid;
  v_national_final_id uuid;
begin
  if tg_table_name = 'internal_entries' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  elsif tg_table_name = 'national_finals' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  elsif tg_table_name = 'national_final_entries' then
    v_national_final_id := coalesce(new.national_final_id, old.national_final_id);
    select nf.submission_id
    into v_submission_id
    from public.national_finals nf
    where nf.id = v_national_final_id;
  end if;

  if v_submission_id is not null then
    insert into public.studio2_confirmation_review_versions (
      submission_id,
      version,
      updated_at
    )
    values (v_submission_id, 1, now())
    on conflict (submission_id)
    do update set
      version = public.studio2_confirmation_review_versions.version + 1,
      updated_at = now();
  end if;

  return coalesce(new, old);
end
$touch$;

revoke all on function private.studio2_touch_confirmation_review_version()
  from public, anon, authenticated;

create or replace function private.studio2_guard_direct_confirmation_review_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $guard$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Selection review transitions must use the Organisation OS V5 operation contract.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end
$guard$;

revoke all on function private.studio2_guard_direct_confirmation_review_transition()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_internal_entry_review_transition
  on public.internal_entries;
create trigger studio2_guard_internal_entry_review_transition
before update of review_status, review_reason, reviewed_at, reviewed_by
on public.internal_entries
for each row execute function private.studio2_guard_direct_confirmation_review_transition();

drop trigger if exists studio2_guard_nf_entry_review_transition
  on public.national_final_entries;
create trigger studio2_guard_nf_entry_review_transition
before update of review_status, review_reason, reviewed_at, reviewed_by, removed, removed_at
on public.national_final_entries
for each row execute function private.studio2_guard_direct_confirmation_review_transition();

drop trigger if exists studio2_guard_nf_winner_transition
  on public.national_finals;
create trigger studio2_guard_nf_winner_transition
before update of winning_entry_id
on public.national_finals
for each row execute function private.studio2_guard_direct_confirmation_review_transition();

drop trigger if exists studio2_touch_internal_entry_review_version
  on public.internal_entries;
create trigger studio2_touch_internal_entry_review_version
after insert or update or delete on public.internal_entries
for each row execute function private.studio2_touch_confirmation_review_version();

drop trigger if exists studio2_touch_nf_review_version
  on public.national_finals;
create trigger studio2_touch_nf_review_version
after insert or update or delete on public.national_finals
for each row execute function private.studio2_touch_confirmation_review_version();

drop trigger if exists studio2_touch_nf_entry_review_version
  on public.national_final_entries;
create trigger studio2_touch_nf_entry_review_version
after insert or update or delete on public.national_final_entries
for each row execute function private.studio2_touch_confirmation_review_version();

create or replace function private.studio2_confirmation_review_context(
  p_target_type text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $context$
declare
  v_target text := lower(btrim(coalesce(p_target_type, '')));
  v_result jsonb;
begin
  if v_target = 'internal' then
    select jsonb_build_object(
      'targetType', 'internal',
      'entryId', entry.id,
      'submissionId', submission.id,
      'editionId', submission.edition_id,
      'currentStatus', entry.review_status,
      'artist', entry.artist,
      'songTitle', entry.song_title,
      'isWinner', false
    )
    into v_result
    from public.internal_entries entry
    join public.submissions submission on submission.id = entry.submission_id
    where entry.id = p_entry_id;
  elsif v_target = 'national_final' then
    select jsonb_build_object(
      'targetType', 'national_final',
      'entryId', entry.id,
      'submissionId', submission.id,
      'editionId', submission.edition_id,
      'nationalFinalId', nf.id,
      'currentStatus', entry.review_status,
      'artist', entry.artist,
      'songTitle', entry.song_title,
      'isWinner', nf.winning_entry_id = entry.id
    )
    into v_result
    from public.national_final_entries entry
    join public.national_finals nf on nf.id = entry.national_final_id
    join public.submissions submission on submission.id = nf.submission_id
    where entry.id = p_entry_id;
  else
    raise exception 'Unknown confirmation review target type'
      using errcode = '22023';
  end if;

  if v_result is null then
    raise exception 'Confirmation review entry not found' using errcode = 'P0002';
  end if;

  return v_result;
end
$context$;

revoke all on function private.studio2_confirmation_review_context(text, uuid)
  from public, anon, authenticated;

create or replace function public.studio2_confirmation_entry_review_preview(
  p_target_type text,
  p_entry_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_context jsonb;
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_version bigint;
begin
  v_context := private.studio2_confirmation_review_context(
    v_target_type,
    p_entry_id
  );

  if not public.studio2_access_allowed(
    'confirmation.manage',
    (v_context ->> 'editionId')::uuid,
    false
  ) then
    raise exception 'Missing Solaris capability: confirmation.manage'
      using errcode = '42501';
  end if;

  if v_target_type = 'internal'
     and v_target_status not in ('pending', 'accepted', 'declined') then
    raise exception 'Invalid internal-selection review state'
      using errcode = '22023';
  end if;

  if v_target_type = 'national_final'
     and v_target_status not in ('pending', 'accepted', 'declined', 'removed') then
    raise exception 'Invalid National Final review state'
      using errcode = '22023';
  end if;

  if coalesce((v_context ->> 'isWinner')::boolean, false)
     and v_target_status <> 'accepted' then
    raise exception 'Clear the National Final winner before changing its accepted review state'
      using errcode = '23514';
  end if;

  select version
  into v_version
  from public.studio2_confirmation_review_versions
  where submission_id = (v_context ->> 'submissionId')::uuid;

  return v_context || jsonb_build_object(
    'targetStatus', v_target_status,
    'expectedVersion', coalesce(v_version, 1),
    'riskClass', 'R2',
    'alreadyApplied', v_context ->> 'currentStatus' = v_target_status
  );
end
$preview$;

revoke all on function public.studio2_confirmation_entry_review_preview(text, uuid, text)
  from public, anon;
grant execute on function public.studio2_confirmation_entry_review_preview(text, uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_entry_review(
  p_target_type text,
  p_entry_id uuid,
  p_target_status text,
  p_reason text,
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
  v_context jsonb;
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_submission_id uuid;
  v_edition_id uuid;
  v_current_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  v_context := private.studio2_confirmation_review_context(
    v_target_type,
    p_entry_id
  );
  v_submission_id := (v_context ->> 'submissionId')::uuid;
  v_edition_id := (v_context ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage'
      using errcode = '42501';
  end if;

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id
  for update;

  if coalesce(v_current_version, 1) is distinct from p_expected_version then
    raise exception 'Selection review changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  -- Re-run all target-state and winner invariants at mutation time.
  perform public.studio2_confirmation_entry_review_preview(
    v_target_type,
    p_entry_id,
    v_target_status
  );

  if v_target_status <> 'accepted' and v_reason is null then
    raise exception 'An organiser reason is required for this review transition'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.entry.review',
    'R2',
    jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', p_entry_id,
      'targetType', v_target_type,
      'targetStatus', v_target_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_target_type = 'internal' then
    update public.internal_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_entry_id;
  else
    update public.national_final_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      removed = v_target_status = 'removed',
      removed_at = case when v_target_status = 'removed' then now() else null end
    where id = p_entry_id;
  end if;

  insert into public.submission_review_history (
    submission_id,
    target_type,
    target_entry_id,
    artist_snapshot,
    song_title_snapshot,
    action,
    reason,
    admin_user_id
  )
  values (
    v_submission_id,
    v_target_type,
    p_entry_id,
    v_context ->> 'artist',
    v_context ->> 'songTitle',
    v_target_status,
    coalesce(v_reason, 'Accepted by organiser'),
    auth.uid()
  );

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'entryId', p_entry_id,
    'targetType', v_target_type,
    'status', v_target_status,
    'version', v_current_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint
) to authenticated, service_role;

create or replace function public.studio2_confirmation_winner_change_preview(
  p_national_final_id uuid,
  p_action text,
  p_entry_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $winner_preview$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_nf public.national_finals;
  v_submission public.submissions;
  v_entry public.national_final_entries;
  v_version bigint;
begin
  select * into v_nf
  from public.national_finals
  where id = p_national_final_id;

  if v_nf.id is null then
    raise exception 'National Final not found' using errcode = 'P0002';
  end if;

  select * into v_submission
  from public.submissions
  where id = v_nf.submission_id;

  if not public.studio2_access_allowed(
    'confirmation.manage',
    v_submission.edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: confirmation.manage'
      using errcode = '42501';
  end if;

  if v_action = 'select' then
    select * into v_entry
    from public.national_final_entries
    where id = p_entry_id
      and national_final_id = p_national_final_id;

    if v_entry.id is null then
      raise exception 'National Final candidate not found'
        using errcode = 'P0002';
    end if;
    if v_entry.removed or v_entry.review_status <> 'accepted' then
      raise exception 'Only an accepted active National Final candidate can be selected as winner'
        using errcode = '23514';
    end if;
  elsif v_action = 'clear' then
    if v_nf.winning_entry_id is null then
      raise exception 'No National Final winner is currently selected'
        using errcode = '23514';
    end if;
  else
    raise exception 'Unknown National Final winner action'
      using errcode = '22023';
  end if;

  select version
  into v_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_nf.submission_id;

  return jsonb_build_object(
    'action', v_action,
    'submissionId', v_nf.submission_id,
    'editionId', v_submission.edition_id,
    'nationalFinalId', v_nf.id,
    'currentWinnerEntryId', v_nf.winning_entry_id,
    'targetEntryId', case when v_action = 'select' then p_entry_id else null end,
    'expectedVersion', coalesce(v_version, 1),
    'riskClass', 'R2',
    'alreadyApplied',
      (v_action = 'select' and v_nf.winning_entry_id = p_entry_id)
  );
end
$winner_preview$;

revoke all on function public.studio2_confirmation_winner_change_preview(uuid, text, uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_winner_change_preview(uuid, text, uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_confirmation_winner_change(
  p_national_final_id uuid,
  p_action text,
  p_entry_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $winner_apply$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_preview jsonb;
  v_nf public.national_finals;
  v_entry public.national_final_entries;
  v_previous_entry public.national_final_entries;
  v_submission_id uuid;
  v_current_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_history_entry_id uuid;
  v_history_artist text;
  v_history_song text;
  v_result jsonb;
begin
  if v_reason is null then
    raise exception 'A reason is required for National Final winner changes'
      using errcode = '22023';
  end if;

  select * into v_nf
  from public.national_finals
  where id = p_national_final_id
  for update;

  if v_nf.id is null then
    raise exception 'National Final not found' using errcode = 'P0002';
  end if;
  v_submission_id := v_nf.submission_id;

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id
  for update;

  if coalesce(v_current_version, 1) is distinct from p_expected_version then
    raise exception 'National Final winner state changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_preview := public.studio2_confirmation_winner_change_preview(
    p_national_final_id,
    v_action,
    p_entry_id
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.nf_winner.' || v_action,
    'R2',
    jsonb_build_object(
      'submissionId', v_submission_id,
      'nationalFinalId', p_national_final_id,
      'entryId', p_entry_id,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_action = 'select' then
    select * into v_entry
    from public.national_final_entries
    where id = p_entry_id
      and national_final_id = p_national_final_id;

    update public.national_finals
    set winning_entry_id = p_entry_id
    where id = p_national_final_id;

    v_history_entry_id := v_entry.id;
    v_history_artist := v_entry.artist;
    v_history_song := v_entry.song_title;
  else
    select * into v_previous_entry
    from public.national_final_entries
    where id = v_nf.winning_entry_id;

    update public.national_finals
    set winning_entry_id = null
    where id = p_national_final_id;

    v_history_entry_id := v_nf.winning_entry_id;
    v_history_artist := v_previous_entry.artist;
    v_history_song := v_previous_entry.song_title;
  end if;

  insert into public.submission_review_history (
    submission_id,
    target_type,
    target_entry_id,
    artist_snapshot,
    song_title_snapshot,
    action,
    reason,
    admin_user_id
  )
  values (
    v_submission_id,
    'national_final',
    v_history_entry_id,
    v_history_artist,
    v_history_song,
    case when v_action = 'select' then 'winner_selected' else 'winner_cleared' end,
    v_reason,
    auth.uid()
  );

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'nationalFinalId', p_national_final_id,
    'action', v_action,
    'winnerEntryId', case when v_action = 'select' then p_entry_id else null end,
    'version', v_current_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$winner_apply$;

revoke all on function public.studio2_apply_confirmation_winner_change(
  uuid, text, uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_winner_change(
  uuid, text, uuid, text, uuid, text, bigint
) to authenticated, service_role;

drop function if exists public.admin_review_confirmation_entry(text, uuid, text, text);
drop function if exists public.admin_set_confirmation_winner(uuid, uuid, text);
drop function if exists public.admin_clear_confirmation_winner(uuid, text);

notify pgrst, 'reload schema';

commit;

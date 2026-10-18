begin;

-- System V3 National Selection authority cutover for country-account winner edits.
--
-- Confirmation-backed National Finals must have one winner authority. Organizer
-- already uses studio2_confirmation_winner_change_preview/apply with exact Entry
-- version binding, optimistic submission-review versioning and an R2 operation
-- receipt. Extend that same authority to the active owner country account and
-- retire the browser-visible compatibility writers for Confirmation-backed NFs.
-- Manual/historical country finals keep the legacy country-history writer.

create or replace function private.v3_country_account_owns_confirmation_nf(
  p_user_id uuid,
  p_national_final_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $owns$
  select p_user_id is not null
    and p_national_final_id is not null
    and exists (
      select 1
      from public.national_finals nf
      join public.submissions submission
        on submission.id = nf.submission_id
      join public.countries country
        on (
          nf.country_id = country.id
          or (
            nf.country_id is null
            and lower(btrim(submission.country)) in (
              lower(btrim(country.name)),
              lower(btrim(country.short_code))
            )
          )
        )
      join public.country_accounts account
        on account.country_id = country.id
       and account.user_id = p_user_id
       and account.status = 'active'
      where nf.id = p_national_final_id
        and nf.submission_id is not null
    )
$owns$;

revoke all on function private.v3_country_account_owns_confirmation_nf(uuid, uuid)
  from public, anon, authenticated;

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
  v_actor uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_nf public.national_finals;
  v_submission public.submissions;
  v_entry public.national_final_entries;
  v_version bigint;
  v_allowed boolean := false;
begin
  select * into v_nf
  from public.national_finals
  where id = p_national_final_id;

  if v_nf.id is null then
    raise exception 'National Final not found' using errcode = 'P0002';
  end if;
  if v_nf.submission_id is null then
    raise exception 'Canonical Selection winner operations require a Confirmation-backed National Final'
      using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions
  where id = v_nf.submission_id;

  if v_submission.id is null then
    raise exception 'Confirmation submission not found for National Final'
      using errcode = '23503';
  end if;

  v_allowed := private.studio2_request_is_service_role()
    or private.v3_country_account_owns_confirmation_nf(v_actor, p_national_final_id)
    or public.studio2_access_allowed(
      'confirmation.manage',
      v_submission.edition_id,
      false
    );

  if not coalesce(v_allowed, false) then
    raise exception 'Missing Selection winner authority for this National Final'
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
    if v_entry.removed
       or v_entry.review_status <> 'accepted'
       or v_entry.current_version_id is null
       or v_entry.reviewed_version_id is distinct from v_entry.current_version_id then
      raise exception 'Only an accepted active National Final candidate on its exact reviewed revision can be selected as winner'
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
    'currentVersionId', v_entry.current_version_id,
    'contentRevision', v_entry.content_revision,
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

-- Keep the historical/manual writer for its actual domain only. A
-- Confirmation-backed NF must enter the exact-version Selection operation above
-- so it cannot bypass S2 receipts, Selection DomainEvents or current-version
-- review invariants.
create or replace function public.set_country_national_final_winner(
  _country_id uuid,
  _national_final_id uuid,
  _winning_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacy_manual$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_scope_edition_id uuid;
begin
  select * into v_country
  from public.countries
  where id = _country_id;

  if v_country.id is null then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  select nf.* into v_nf
  from public.national_finals nf
  left join public.submissions submission on submission.id = nf.submission_id
  where nf.id = _national_final_id
    and (
      nf.country_id = _country_id
      or (
        nf.country_id is null
        and submission.id is not null
        and lower(btrim(submission.country)) in (
          lower(btrim(v_country.name)),
          lower(btrim(v_country.short_code))
        )
      )
    );

  if v_nf.id is null then
    if not private.studio2_can_manage_country_national_final_scope(
      _country_id,
      null,
      true
    ) then
      raise exception 'You cannot edit national finals for this country.' using errcode = '42501';
    end if;
    raise exception 'National final not found for this country.' using errcode = '22023';
  end if;

  v_scope_edition_id := coalesce(
    v_nf.edition_id,
    (select submission.edition_id from public.submissions submission where submission.id = v_nf.submission_id)
  );

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    v_scope_edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode = '42501';
  end if;

  if v_nf.submission_id is not null or v_nf.source is distinct from 'manual' then
    raise exception 'Confirmation-backed National Final winners must use the canonical Selection operation'
      using errcode = '55000';
  end if;

  if _winning_entry_id is not null and not exists (
    select 1
    from public.national_final_entries entry
    where entry.id = _winning_entry_id
      and entry.national_final_id = v_nf.id
      and not coalesce(entry.removed, false)
      and entry.review_status = 'accepted'
  ) then
    raise exception 'Winner must be an accepted active entry from this national final.'
      using errcode = '22023';
  end if;

  update public.national_finals
  set winning_entry_id = _winning_entry_id
  where id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'winning_entry_id', _winning_entry_id
  );
end
$legacy_manual$;

revoke all on function public.set_country_national_final_winner(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.set_country_national_final_winner(uuid, uuid, uuid)
  to authenticated, service_role;

-- Confirmations now runs on Solaris Studio's canonical database. The old
-- client-side sync RPC would be a second winner writer over the same row, so it
-- is retained only as inert historical schema and is no longer executable by
-- application or service roles.
revoke all on function public.set_confirmation_national_final_winner_from_solaris(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Fail the migration if a browser role could still use either compatibility
-- path to mutate a Confirmation-backed winner outside the canonical R2 apply.
do $verify$
begin
  if not has_function_privilege(
    'authenticated',
    'public.studio2_confirmation_winner_change_preview(uuid,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.studio2_apply_confirmation_winner_change(uuid,text,uuid,text,uuid,text,bigint,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Canonical Selection winner authority is not executable by authenticated owners';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.set_confirmation_national_final_winner_from_solaris(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.set_confirmation_national_final_winner_from_solaris(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Legacy Confirmation winner sync writer remains executable';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

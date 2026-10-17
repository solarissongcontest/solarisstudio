begin;

-- Emergency Confirmation operational hotfix for the V3 maintenance window.
--
-- The browser product remains globally maintenance-gated. This migration only
-- restores the existing Confirmation domain for authorized Organizer/HOD use.
-- It deliberately separates:
--   * a Confirmation requirement (edition + country obligation),
--   * round state (whether NEW submissions are accepted), and
--   * an existing response's editability.
--
-- A closed round may therefore have one existing response explicitly reopened
-- without creating a new Confirmation requirement or reopening the round.

-- Legacy Confirmation admin functions historically delegated to
-- studio2_access_allowed('delegation.manage'), which is correctly blocked by the
-- platform read_only mode. During the emergency maintenance window, however,
-- authorized Organizers still need to operate Confirmation itself. Keep that
-- exception domain-scoped instead of weakening the global platform-mode rules.
create or replace function private.solaris_confirmation_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_request_is_service_role()
    or (
      auth.uid() is not null
      and (
        private.studio2_user_has_capability(auth.uid(), 'confirmation.manage', null)
        or private.studio2_user_has_capability(auth.uid(), 'delegation.manage', null)
      )
    );
$$;

revoke all on function private.solaris_confirmation_admin_allowed()
  from public, anon, authenticated;
grant execute on function private.solaris_confirmation_admin_allowed()
  to service_role;

-- studio2_country_cockpit is a read projection. Its legacy HOD projection still
-- performs confirmation.manage/delegation.manage checks internally, so a
-- transaction-local read context maps only those nested READ checks to their
-- read capability equivalents. No browser caller can use this to broaden a
-- separate mutation: the setting exists only inside this RPC transaction.
create or replace function public.studio2_access_allowed(
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_has_capability boolean := false;
  v_access_level text;
  v_mode text := 'normal';
  v_read_context text := current_setting('solaris.confirmation_read_context', true);
begin
  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  if v_read_context = 'on' and p_capability in ('confirmation.manage', 'delegation.manage') then
    v_has_capability := private.studio2_user_has_capability(
      v_actor,
      case
        when p_capability = 'confirmation.manage' then 'confirmation.read'
        else 'delegation.read'
      end,
      p_edition_id
    );
    if v_has_capability then
      return true;
    end if;
  end if;

  v_has_capability := private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );

  if not v_has_capability then
    return false;
  end if;

  select capability.access_level
  into v_access_level
  from public.studio2_capabilities capability
  where capability.key = p_capability;

  if v_access_level is null then
    return false;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  return private.studio2_capability_allowed_in_platform_mode(
    p_capability,
    v_access_level,
    coalesce(v_mode, 'normal')
  );
end
$$;

create or replace function public.studio2_country_cockpit(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  if not (
    public.studio2_access_allowed('confirmation.read', p_edition_id, false)
    or public.studio2_access_allowed('delegation.read', p_edition_id, false)
  ) then
    raise exception 'Organizer Confirmation read capability required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.editions e where e.id = p_edition_id) then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  perform set_config('solaris.confirmation_read_context', 'on', true);

  with participating_countries as (
    select distinct p.country_id
    from public.participants p
    where p.edition_id = p_edition_id
      and p.country_id is not null

    union

    select distinct ce.country_id
    from public.participants p
    join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.edition_id = p_edition_id
      and p.country_id is null
      and ce.country_id is not null

    union

    select distinct e.country_id
    from public.entries e
    where e.edition_id = p_edition_id
      and e.country_id is not null
  )
  select coalesce(
    jsonb_agg(public.studio2_hod_context(p_edition_id, pc.country_id) order by c.name),
    '[]'::jsonb
  )
  into v_rows
  from participating_countries pc
  join public.countries c on c.id = pc.country_id;

  perform set_config('solaris.confirmation_read_context', 'off', true);
  return v_rows;
exception
  when others then
    perform set_config('solaris.confirmation_read_context', 'off', true);
    raise;
end
$$;

revoke all on function public.studio2_country_cockpit(uuid) from public, anon;
grant execute on function public.studio2_country_cockpit(uuid) to authenticated, service_role;

-- A response-level editing flag is authoritative for that existing response.
-- round.status continues to control NEW submissions. round.editing_enabled is a
-- bulk Organizer policy (its existing RPC synchronizes response flags), but it
-- must not veto an explicit per-response reopen after the round is closed.
create or replace function public.public_country_account_confirmation_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  responses jsonb;
begin
  if caller_user_id is null then
    return jsonb_build_object('authenticated', false, 'country', null, 'responses', '[]'::jsonb);
  end if;

  select ca.country_id into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object('authenticated', false, 'country', null, 'responses', '[]'::jsonb);
  end if;

  select c.* into country_row from public.countries c where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object('authenticated', false, 'country', null, 'responses', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'round_id', r.id,
        'round_name', r.name,
        'round_status', r.status,
        'round_editing_enabled', coalesce(r.editing_enabled, false),
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'country', s.country,
        'participating', s.participating,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'selection_method', s.selection_method,
        'entry_unknown', s.entry_unknown,
        'reveal_date_type', s.reveal_date_type,
        'reveal_exact_date', s.reveal_exact_date,
        'reveal_approximate_text', s.reveal_approximate_text,
        'nf_date_type', s.nf_date_type,
        'nf_exact_date', s.nf_exact_date,
        'nf_result_date_type', s.nf_result_date_type,
        'nf_result_exact_date', s.nf_result_exact_date,
        'editing_allowed', coalesce(s.editing_allowed, false),
        'locked', coalesce(s.locked, false),
        'edition_editing_enabled', coalesce(e.editing_enabled, false),
        'internal_entry', (
          select jsonb_build_object(
            'id', i.id,
            'artist', i.artist,
            'song_title', i.song_title,
            'review_status', coalesce(i.review_status, 'pending'),
            'review_reason', i.review_reason,
            'reviewed_at', i.reviewed_at
          )
          from public.internal_entries i
          where i.submission_id = s.id
          limit 1
        ),
        'national_final', (
          select jsonb_build_object(
            'id', nf.id,
            'nf_name', nf.nf_name,
            'winning_entry_id', nf.winning_entry_id,
            'entries', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', nfe.id,
                  'artist', nfe.artist,
                  'song_title', nfe.song_title,
                  'position', nfe.position,
                  'review_status', coalesce(nfe.review_status, 'pending'),
                  'review_reason', nfe.review_reason,
                  'reviewed_at', nfe.reviewed_at,
                  'removed', coalesce(nfe.removed, false)
                )
                order by nfe.position, nfe.id
              )
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ), '[]'::jsonb)
          )
          from public.national_finals nf
          where nf.submission_id = s.id
          limit 1
        ),
        'can_edit',
          not coalesce(s.locked, false)
          and coalesce(s.editing_allowed, false)
          and coalesce(e.editing_enabled, false),
        'reason',
          case
            when coalesce(s.locked, false) then 'locked'
            when not coalesce(s.editing_allowed, false)
              or not coalesce(e.editing_enabled, false) then 'editing_closed'
            else 'open'
          end
      )
      order by e.edition_number desc, s.submitted_at desc
    ),
    '[]'::jsonb
  ) into responses
  from public.submissions s
  join public.submission_rounds r on r.id = s.round_id
  join public.editions e on e.id = r.edition_id
  where lower(trim(s.country)) in (lower(trim(country_row.name)), lower(trim(country_row.short_code)));

  return jsonb_build_object(
    'authenticated', true,
    'country', jsonb_build_object(
      'country_id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code
    ),
    'responses', responses
  );
end
$$;

create or replace function public.public_create_country_account_edit_token(_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  submission_row public.submissions;
  edition_row public.editions;
  raw_token text;
  token_hash text;
begin
  if caller_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if _round_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_round');
  end if;

  select ca.country_id
  into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id
    and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select c.* into country_row
  from public.countries c
  where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select s.* into submission_row
  from public.submissions s
  where s.round_id = _round_id
    and lower(trim(s.country)) in (
      lower(trim(country_row.name)),
      lower(trim(country_row.short_code))
    )
  order by s.submitted_at desc
  limit 1
  for update;

  if submission_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into edition_row
  from public.editions
  where id = submission_row.edition_id;

  if coalesce(submission_row.locked, false) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if not coalesce(submission_row.editing_allowed, false)
     or not coalesce(edition_row.editing_enabled, false) then
    return jsonb_build_object('ok', false, 'reason', 'editing_closed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(submission_row.id::text || ':country_account', 0)
  );

  update public.edit_tokens
  set active = false
  where submission_id = submission_row.id
    and token_type = 'country_account'
    and active = true;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  insert into public.edit_tokens (
    submission_id,
    token_hash,
    token_type,
    active,
    created_at,
    expires_at,
    use_count
  ) values (
    submission_row.id,
    token_hash,
    'country_account',
    true,
    now(),
    now() + interval '2 hours',
    0
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'submission_id', submission_row.id,
    'country', submission_row.country,
    'token', raw_token,
    'expires_at', now() + interval '2 hours'
  );
end
$$;

-- Resolve links against CURRENT editability so closing editing invalidates an
-- already-issued URL as well as preventing creation of a new one.
create or replace function public.public_resolve_edit_token(_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.edit_tokens;
  s public.submissions;
  r public.submission_rounds;
  e public.editions;
  internal_data jsonb;
  nf_data jsonb;
begin
  select * into tok
  from public.edit_tokens
  where token_hash = _token_hash
    and active
    and (expires_at is null or expires_at > now())
  limit 1;

  if tok.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select * into s from public.submissions where id = tok.submission_id;
  if s.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;
  if s.locked then
    return jsonb_build_object('valid', false, 'reason', 'locked');
  end if;

  select * into r from public.submission_rounds where id = s.round_id;
  select * into e from public.editions where id = s.edition_id;

  if not coalesce(s.editing_allowed, false)
     or not coalesce(e.editing_enabled, false) then
    return jsonb_build_object('valid', false, 'reason', 'editing_closed');
  end if;

  select to_jsonb(i) into internal_data
  from public.internal_entries i
  where i.submission_id = s.id
  limit 1;

  select case
    when nf.id is null then null
    else to_jsonb(nf) || jsonb_build_object(
      'national_final_entries', coalesce((
        select jsonb_agg(to_jsonb(nfe) order by nfe.position)
        from public.national_final_entries nfe
        where nfe.national_final_id = nf.id
      ), '[]'::jsonb)
    )
  end
  into nf_data
  from public.national_finals nf
  where nf.submission_id = s.id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'reason', 'ok',
    'submission', to_jsonb(s) || jsonb_build_object(
      'internal_entries', internal_data,
      'national_finals', nf_data
    ),
    'round', jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'status', r.status,
      'opens_at', r.opens_at,
      'closes_at', r.closes_at,
      'response_limit', r.response_limit,
      'edition_id', e.id,
      'edition_name', e.name,
      'edition_number', e.edition_number
    )
  );
end
$$;

-- Preserve the existing Organizer UI contract while making close/edit actions
-- authoritative under the maintenance-domain exception. Closing or locking a
-- response revokes every active edit link immediately.
create or replace function public.admin_update_confirmation_controls(
  _submission_id uuid,
  _editing_allowed boolean,
  _locked boolean,
  _admin_notes text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_submission public.submissions;
  v_edition public.editions;
begin
  select * into v_submission
  from public.submissions
  where id = _submission_id
  for update;

  if v_submission.id is null then
    return false;
  end if;

  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select * into v_edition
  from public.editions
  where id = v_submission.edition_id;

  if coalesce(_editing_allowed, false) and not coalesce(v_edition.editing_enabled, false) then
    raise exception 'Edition editing is disabled. Enable edition editing before reopening this response.'
      using errcode = '23514';
  end if;

  update public.submissions
  set
    editing_allowed = coalesce(_editing_allowed, false),
    locked = coalesce(_locked, false),
    admin_notes = _admin_notes,
    updated_at = now()
  where id = _submission_id;

  if not coalesce(_editing_allowed, false) or coalesce(_locked, false) then
    update public.edit_tokens
    set active = false
    where submission_id = _submission_id
      and active = true;
  end if;

  return true;
end
$$;

revoke all on function public.admin_update_confirmation_controls(uuid, boolean, boolean, text)
  from public, anon;
grant execute on function public.admin_update_confirmation_controls(uuid, boolean, boolean, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

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

-- The HOD context is a READ projection. The previous implementation required
-- confirmation.manage merely to inspect another delegation. In read_only mode
-- that operate-level capability is denied, which made the Organizer country
-- cockpit fail even for a real Organizer. Read inspection now uses read-level
-- capability while country owners keep their existing self-service access.
create or replace function public.studio2_hod_context_legacy_roster(
  p_edition_id uuid,
  p_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_can_manage_country boolean := false;
  v_edition_name text;
  v_country_name text;
  v_participant_status text;
  v_publication_status text;
  v_entry jsonb;
  v_jury_required integer := 5;
  v_jury_assigned integer := 0;
  v_jury_members jsonb := '[]'::jsonb;
  v_jury_ballot_submitted boolean := false;
  v_notices jsonb := '[]'::jsonb;
  v_deadlines jsonb := '[]'::jsonb;
  v_review_history jsonb := '[]'::jsonb;
  v_unresolved_organizer_issues integer := 0;
begin
  if p_edition_id is null or p_country_id is null then
    raise exception 'Edition id and country id are required' using errcode = '22023';
  end if;

  v_can_manage_country := coalesce(
    public.studio2_access_allowed('confirmation.read', p_edition_id, false)
    or public.studio2_access_allowed('delegation.read', p_edition_id, false),
    false
  );

  if not v_is_service
     and not v_can_manage_country
     and not public.owns_country(v_actor, p_country_id) then
    raise exception 'Country ownership or country-read capability required' using errcode = '42501';
  end if;

  select e.name
  into v_edition_name
  from public.editions e
  where e.id = p_edition_id;

  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  select c.name
  into v_country_name
  from public.countries c
  where c.id = p_country_id;

  if not found then
    raise exception 'Country not found: %', p_country_id using errcode = 'P0002';
  end if;

  select p.participation_status, p.publication_status
  into v_participant_status, v_publication_status
  from public.participants p
  where p.edition_id = p_edition_id
    and p.country_id = p_country_id
    and p.show_id is null
  order by p.updated_at desc, p.created_at desc
  limit 1;

  select jsonb_build_object(
      'id', e.id,
      'artist', e.artist,
      'songTitle', e.song_title,
      'songUrl', e.song_url,
      'status', e.status,
      'source', e.source,
      'metadata', e.metadata,
      'createdAt', e.created_at,
      'updatedAt', e.updated_at
    )
  into v_entry
  from public.entries e
  where e.edition_id = p_edition_id
    and e.country_id = p_country_id
  order by e.updated_at desc, e.created_at desc
  limit 1;

  select s.jury_members_required
  into v_jury_required
  from public.studio2_delegation_settings s
  where s.edition_id = p_edition_id
    and s.country_id = p_country_id;

  v_jury_required := coalesce(v_jury_required, 5);

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', jm.id,
          'displayName', jm.display_name,
          'memberUserId', jm.member_user_id,
          'createdAt', jm.created_at
        ) order by jm.created_at, jm.id
      ),
      '[]'::jsonb
    )
  into v_jury_assigned, v_jury_members
  from public.studio2_jury_members jm
  where jm.edition_id = p_edition_id
    and jm.country_id = p_country_id
    and jm.status = 'assigned';

  select exists (
    select 1
    from public.jury_ballot_submissions jbs
    where jbs.edition_id = p_edition_id
      and jbs.voter_country_id = p_country_id
      and jbs.status = 'submitted'
  )
  into v_jury_ballot_submitted;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'severity', n.severity,
        'acknowledgementRequired', n.acknowledgement_required,
        'acknowledged', case
          when v_is_service or v_can_manage_country then exists (
            select 1
            from public.studio2_notice_receipts r
            join public.country_accounts ca on ca.user_id = r.recipient_user_id
            where r.notice_id = n.id
              and ca.country_id = p_country_id
              and ca.status = 'active'
              and r.acknowledged_at is not null
          )
          else exists (
            select 1
            from public.studio2_notice_receipts r
            where r.notice_id = n.id
              and r.recipient_user_id = v_actor
              and r.acknowledged_at is not null
          )
        end
      ) order by n.sent_at desc, n.created_at desc
    ),
    '[]'::jsonb
  )
  into v_notices
  from public.studio2_official_notices n
  where n.status = 'published'
    and n.sent_at is not null
    and (n.edition_id is null or n.edition_id = p_edition_id)
    and n.audience in ('all_delegations', 'participating_countries', 'specific_countries', 'hods')
    and (
      n.audience in ('all_delegations', 'hods')
      or (
        n.audience = 'participating_countries'
        and exists (
          select 1
          from public.participants p
          left join public.contest_entities ce on ce.id = p.contest_entity_id
          where p.edition_id = p_edition_id
            and coalesce(p.country_id, ce.country_id) = p_country_id
        )
      )
      or (
        n.audience = 'specific_countries'
        and p_country_id = any(coalesce(n.country_ids, '{}'::uuid[]))
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'kind', d.kind,
        'label', d.label,
        'dueAt', d.due_at,
        'completedAt', d.completed_at,
        'notes', d.notes
      ) order by d.completed_at nulls first, d.due_at, d.label
    ),
    '[]'::jsonb
  )
  into v_deadlines
  from public.admin_deadlines d
  where d.edition_id = p_edition_id
    and d.kind in ('entry', 'jury', 'publication');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', history.id,
        'action', history.action,
        'targetType', history.target_type,
        'artist', history.artist_snapshot,
        'songTitle', history.song_title_snapshot,
        'reason', history.reason,
        'createdAt', history.created_at
      ) order by history.created_at desc
    ),
    '[]'::jsonb
  )
  into v_review_history
  from (
    select h.*
    from public.submission_review_history h
    join public.submissions s on s.id = h.submission_id
    where s.edition_id = p_edition_id
      and lower(btrim(s.country)) = lower(btrim(v_country_name))
    order by h.created_at desc
    limit 30
  ) history;

  select count(*)::integer
  into v_unresolved_organizer_issues
  from public.studio2_incidents i
  where i.edition_id = p_edition_id
    and i.status <> 'resolved'
    and i.category in ('delegation', 'publication')
    and exists (
      select 1
      from unnest(i.affected_systems) affected(value)
      where lower(affected.value) = lower('country:' || p_country_id::text)
         or lower(affected.value) = lower('country:' || v_country_name)
    );

  return jsonb_build_object(
    'editionId', p_edition_id,
    'editionName', v_edition_name,
    'countryId', p_country_id,
    'countryName', v_country_name,
    'confirmationComplete', coalesce(v_participant_status = 'confirmed', false),
    'participantStatus', v_participant_status,
    'publicationStatus', v_publication_status,
    'entry', v_entry,
    'juryMembersRequired', v_jury_required,
    'juryMembersAssigned', v_jury_assigned,
    'juryMembers', v_jury_members,
    'juryBallotSubmitted', v_jury_ballot_submitted,
    'notices', v_notices,
    'deadlines', v_deadlines,
    'reviewHistory', v_review_history,
    'unresolvedOrganizerIssues', v_unresolved_organizer_issues
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

  return v_rows;
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
        'reviewed', coalesce(s.reviewed, false),
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
            'reviewed_at', i.reviewed_at,
            'replacement_video_required', coalesce(i.replacement_video_required, false),
            'replacement_video_url', i.replacement_video_url
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
                  'removed', coalesce(nfe.removed, false),
                  'replacement_video_required', coalesce(nfe.replacement_video_required, false),
                  'replacement_video_url', nfe.replacement_video_url
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
      'short_code', country_row.short_code,
      'flag_image', country_row.flag_image
    ),
    'responses', responses
  );
end
$$;

-- One participant-safe projection for the temporary maintenance card. It only
-- exposes the authenticated country account's own delegation, current relevant
-- edition, canonical requirement and participant-safe response/review fields.
create or replace function public.public_country_account_confirmation_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_access jsonb;
  v_country_id uuid;
  v_edition public.editions;
  v_requirement public.studio2_confirmation_requirements;
  v_response jsonb;
  v_participation_status text;
begin
  v_access := public.public_country_account_confirmation_access();

  if coalesce((v_access ->> 'authenticated')::boolean, false) is not true then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'edition', null,
      'participation_status', null,
      'requirement', null,
      'response', null
    );
  end if;

  v_country_id := nullif(v_access -> 'country' ->> 'country_id', '')::uuid;

  select edition.*
  into v_edition
  from public.editions edition
  where exists (
    select 1
    from public.studio2_confirmation_requirements requirement
    where requirement.edition_id = edition.id
      and requirement.country_id = v_country_id
      and requirement.superseded_at is null
  )
  or exists (
    select 1
    from public.submissions submission
    join public.countries country on country.id = v_country_id
    where submission.edition_id = edition.id
      and lower(btrim(submission.country)) in (
        lower(btrim(country.name)),
        lower(btrim(country.short_code))
      )
  )
  order by
    case when edition.status = 'active' then 0 else 1 end,
    edition.edition_number desc nulls last,
    edition.created_at desc
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object(
      'authenticated', true,
      'country', v_access -> 'country',
      'edition', null,
      'participation_status', null,
      'requirement', null,
      'response', null
    );
  end if;

  select requirement.*
  into v_requirement
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = v_edition.id
    and requirement.country_id = v_country_id
    and requirement.superseded_at is null
  limit 1;

  select response.value
  into v_response
  from jsonb_array_elements(coalesce(v_access -> 'responses', '[]'::jsonb)) response(value)
  where response.value ->> 'edition_id' = v_edition.id::text
  order by coalesce(
    nullif(response.value ->> 'updated_at', '')::timestamptz,
    nullif(response.value ->> 'submitted_at', '')::timestamptz
  ) desc nulls last
  limit 1;

  select participant.participation_status
  into v_participation_status
  from public.participants participant
  where participant.edition_id = v_edition.id
    and participant.country_id = v_country_id
    and participant.show_id is null
  order by participant.updated_at desc, participant.created_at desc
  limit 1;

  return jsonb_build_object(
    'authenticated', true,
    'country', v_access -> 'country',
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'edition_number', v_edition.edition_number,
      'status', v_edition.status
    ),
    'participation_status', v_participation_status,
    'requirement', case
      when v_requirement.id is null then null
      else jsonb_build_object(
        'id', v_requirement.id,
        'generation', v_requirement.generation,
        'status', v_requirement.status,
        'valid_from', v_requirement.valid_from,
        'resolved_by_submission_id', v_requirement.resolved_by_submission_id,
        'resolved_at', v_requirement.resolved_at
      )
    end,
    'response', v_response
  );
end
$$;

revoke all on function public.public_country_account_confirmation_portal()
  from public, anon;
grant execute on function public.public_country_account_confirmation_portal()
  to authenticated, service_role;

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

-- The authoritative V3 submit wrapper now locks and revalidates an edit-token
-- response before handing it to the legacy writer. This closes the race where
-- an Organizer could close editing while a previously-issued token was already
-- in flight. Whichever operation obtains the response row first wins; the later
-- operation sees the resulting canonical state.
create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_round_id uuid;
  v_request_hash text;
  v_payload_session text;
  v_existing private.v3_confirmation_operations%rowtype;
  v_result jsonb;
  v_receipt_id uuid;
  v_accepted_at timestamptz;
  v_edit_token_hash text;
  v_edit_token public.edit_tokens;
  v_edit_submission public.submissions;
  v_edit_edition public.editions;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Confirmation payload must be a JSON object' using errcode = '22023';
  end if;
  if _idempotency_key is null then
    raise exception 'Confirmation idempotency key is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;

  v_payload_session := nullif(btrim(coalesce(payload ->> 'browser_session_id', '')), '');
  if v_payload_session is null or v_payload_session <> _browser_session_id then
    raise exception 'Confirmation browser-session scope does not match payload'
      using errcode = '22023';
  end if;

  begin
    v_round_id := nullif(payload ->> 'round_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Confirmation round id is invalid' using errcode = '22023';
  end;
  if v_round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((payload - 'client_ip')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform _request_hash;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-confirmation:' || _idempotency_key::text, 0)
  );

  select operation.*
  into v_existing
  from private.v3_confirmation_operations operation
  where operation.idempotency_key = _idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash
       or v_existing.round_id <> v_round_id
       or v_existing.browser_session_id <> _browser_session_id then
      raise exception 'Confirmation idempotency key was already used for a different request'
        using errcode = '22023';
    end if;

    return v_existing.result || jsonb_build_object(
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'receipt_id', v_existing.receipt_id,
        'idempotency_key', v_existing.idempotency_key,
        'request_hash', v_existing.request_hash,
        'round_id', v_existing.round_id,
        'accepted_at', v_existing.accepted_at,
        'replayed', true
      )
    );
  end if;

  v_edit_token_hash := nullif(payload ->> 'edit_token_hash', '');
  if v_edit_token_hash is not null then
    select token.*
    into v_edit_token
    from public.edit_tokens token
    where token.token_hash = v_edit_token_hash
      and token.active = true
      and (token.expires_at is null or token.expires_at > now())
    order by token.created_at desc
    limit 1;

    if v_edit_token.id is null then
      v_result := jsonb_build_object('ok', false, 'error', 'invalid_token');
    else
      select submission.*
      into v_edit_submission
      from public.submissions submission
      where submission.id = v_edit_token.submission_id
      for update;

      select edition.*
      into v_edit_edition
      from public.editions edition
      where edition.id = v_edit_submission.edition_id;

      if v_edit_submission.id is null
         or v_edit_submission.round_id <> v_round_id
         or coalesce(v_edit_submission.locked, false)
         or not coalesce(v_edit_submission.editing_allowed, false)
         or not coalesce(v_edit_edition.editing_enabled, false) then
        v_result := jsonb_build_object('ok', false, 'error', 'invalid_token');
      else
        select to_jsonb(public.submit_confirmation(payload)) into v_result;
      end if;
    end if;
  else
    select to_jsonb(public.submit_confirmation(payload)) into v_result;
  end if;

  if v_result is null then
    raise exception 'Confirmation submit returned no result' using errcode = '55000';
  end if;

  v_receipt_id := gen_random_uuid();
  v_accepted_at := now();

  insert into private.v3_confirmation_operations (
    idempotency_key,
    request_hash,
    round_id,
    browser_session_id,
    result,
    receipt_id,
    accepted_at
  ) values (
    _idempotency_key,
    v_request_hash,
    v_round_id,
    _browser_session_id,
    v_result,
    v_receipt_id,
    v_accepted_at
  );

  return v_result || jsonb_build_object(
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'receipt_id', v_receipt_id,
      'idempotency_key', _idempotency_key,
      'request_hash', v_request_hash,
      'round_id', v_round_id,
      'accepted_at', v_accepted_at,
      'replayed', false
    )
  );
end
$$;

revoke all on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  from public, anon;
grant execute on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

begin;

-- Phase 6: enrich the existing HOD context with canonical operational signals.
-- Delegation users still receive only their own country context; organizers may
-- inspect a country through the same RPC, while the UI keeps inspection read-only.
create or replace function public.studio2_hod_context(
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
  v_edition_name text;
  v_country_name text;
  v_participant_status text;
  v_publication_status text;
  v_entry jsonb;
  v_entry_id uuid;
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

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not public.owns_country(v_actor, p_country_id) then
    raise exception 'Country ownership or organizer role required' using errcode = '42501';
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

  select
    e.id,
    jsonb_build_object(
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
  into v_entry_id, v_entry
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
        'acknowledged', exists (
          select 1
          from public.studio2_notice_receipts r
          where r.notice_id = n.id
            and r.recipient_user_id = v_actor
            and r.acknowledged_at is not null
        )
      ) order by n.sent_at desc, n.created_at desc
    ),
    '[]'::jsonb
  )
  into v_notices
  from public.studio2_official_notices n
  where n.status = 'published'
    and n.sent_at is not null
    and (n.edition_id is null or n.edition_id = p_edition_id)
    and (
      v_is_service
      or private.studio2_user_can_receive_notice_v2(
        v_actor,
        n.edition_id,
        n.audience,
        n.country_ids,
        n.audience_group
      )
    );

  -- admin_deadlines has edition/show scope but no country dimension. The HOD
  -- cockpit therefore exposes edition-wide delegation deadlines, never inventing
  -- country-specific deadlines that the source system cannot represent.
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
  where d.edition_id is null or d.edition_id = p_edition_id;

  -- The legacy confirmations subsystem stores submission country as text. Match
  -- it to the canonical country name explicitly rather than pretending target_entry_id
  -- points at public.entries (it does not).
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
    and i.category in ('delegation', 'publication');

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

revoke all on function public.studio2_hod_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

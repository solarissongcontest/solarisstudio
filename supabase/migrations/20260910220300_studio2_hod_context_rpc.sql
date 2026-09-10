begin;

-- Read-only compatibility bridge for the HOD workspace. This exposes only the
-- current delegation's required legacy data without broadening RLS on entries
-- or unpublished editions.
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
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_edition_name text;
  v_country_name text;
  v_participant_status text;
  v_publication_status text;
  v_entry jsonb;
  v_jury_required integer := 5;
  v_jury_assigned integer := 0;
  v_jury_ballot_submitted boolean := false;
  v_notices jsonb := '[]'::jsonb;
begin
  if p_edition_id is null or p_country_id is null then
    raise exception 'Edition id and country id are required' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not public.owns_country(v_actor, p_country_id) then
    raise exception 'Country ownership or organizer role required' using errcode = '42501';
  end if;

  select e.edition_name
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
    'artist', e.artist,
    'songTitle', e.song_title,
    'songUrl', e.song_url,
    'status', e.status,
    'source', e.source,
    'metadata', e.metadata
  )
  into v_entry
  from public.entries e
  where e.edition_id = p_edition_id
    and e.country_id = p_country_id
  limit 1;

  select s.jury_members_required
  into v_jury_required
  from public.studio2_delegation_settings s
  where s.edition_id = p_edition_id
    and s.country_id = p_country_id;

  v_jury_required := coalesce(v_jury_required, 5);

  select count(*)::integer
  into v_jury_assigned
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
  where n.sent_at is not null
    and (n.edition_id is null or n.edition_id = p_edition_id)
    and (
      v_is_service
      or private.studio2_user_can_receive_notice(
        v_actor,
        n.edition_id,
        n.audience,
        n.country_ids
      )
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
    'juryBallotSubmitted', v_jury_ballot_submitted,
    'notices', v_notices
  );
end
$$;

revoke all on function public.studio2_hod_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

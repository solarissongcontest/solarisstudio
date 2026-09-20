-- Production audit hardening:
-- 1. admin_deadlines are Organizer reminders, not official delegation workflow
--    deadlines. Do not expose them through the HOD operational context.
-- 2. Existing result rows without a governed calculation version are legacy
--    reconciliation data, not a completed Results operation.

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
  v_context jsonb;
  v_assignment_id uuid;
  v_person_id uuid;
  v_display_name text;
  v_member_user_id uuid;
  v_created_at timestamptz;
  v_channel text;
  v_jury_members jsonb := '[]'::jsonb;
  v_assigned integer := 0;
begin
  v_context := public.studio2_hod_context_legacy_roster(p_edition_id, p_country_id);

  select
    a.id,
    a.person_id,
    p.display_name,
    ca.user_id,
    a.created_at,
    a.channel
  into
    v_assignment_id,
    v_person_id,
    v_display_name,
    v_member_user_id,
    v_created_at,
    v_channel
  from public.delegation_hod_assignments a
  join public.delegation_people p on p.id = a.person_id
  left join public.country_accounts ca
    on p.identity_key = 'account:' || ca.user_id::text
   and ca.country_id = p_country_id
   and ca.status = 'active'
  where a.edition_id = p_edition_id
    and a.country_id = p_country_id
    and a.channel in ('jury', 'delegation')
  order by
    case when a.channel = 'jury' then 0 else 1 end,
    a.updated_at desc,
    a.id
  limit 1;

  if found then
    v_assigned := 1;
    v_jury_members := jsonb_build_array(
      jsonb_build_object(
        'id', v_assignment_id,
        'displayName', v_display_name,
        'memberUserId', v_member_user_id,
        'createdAt', v_created_at
      )
    );
  end if;

  return v_context || jsonb_build_object(
    'juryMembersRequired', 1,
    'juryMembersAssigned', v_assigned,
    'juryMembers', v_jury_members,
    'juryHodPersonId', v_person_id,
    'juryHodChannel', v_channel,
    'deadlines', '[]'::jsonb
  );
end
$$;

revoke all on function public.studio2_hod_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_hod_context(uuid, uuid)
  to authenticated, service_role;

comment on function public.studio2_hod_context(uuid, uuid) is
  'Studio 2 HOD workspace context. Uses canonical HOD identity and excludes Organizer reminders from delegation workflow deadlines.';

create or replace function public.studio2_results_operations_snapshot(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rows jsonb := '[]'::jsonb;
  v_pre jsonb;
  v_state text;
  r record;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.editions e where e.id = p_edition_id) then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;
  if not v_is_service and not private.studio2_can_preview_results(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: results.preview' using errcode = '42501';
  end if;

  for r in
    select
      s.id, s.name, s.kind, s.sort_order,
      coalesce(o.calculation_version, 0) as calculation_version,
      o.last_calculated_at, o.last_calculated_by,
      o.reviewed_version, o.reviewed_at, o.reviewed_by,
      o.locked_version, o.locked_at, o.locked_by,
      o.reveal_ready_version, o.reveal_ready_at, o.reveal_ready_by
    from public.shows s
    left join public.studio2_result_operations o on o.show_id = s.id
    where s.edition_id = p_edition_id
    order by s.sort_order, s.name
  loop
    v_pre := private.studio2_result_preconditions(r.id);

    v_state := case
      when coalesce((v_pre ->> 'publishedResults')::boolean, false) then 'published'
      when r.calculation_version > 0 and r.reveal_ready_version = r.calculation_version then 'reveal_ready'
      when r.calculation_version > 0 and r.locked_version = r.calculation_version then 'locked'
      when r.calculation_version > 0 and r.reviewed_version = r.calculation_version then 'reviewed'
      when r.calculation_version > 0
        and coalesce((v_pre ->> 'resultReady')::boolean, false) then 'calculated'
      when coalesce((v_pre ->> 'calculationReady')::boolean, false) then 'calculation_ready'
      when coalesce((v_pre ->> 'resultRowCount')::integer, 0) > 0
        or coalesce((v_pre ->> 'juryVoteRows')::integer, 0) > 0
        or coalesce((v_pre ->> 'televoteVoteRows')::integer, 0) > 0 then 'validation'
      else 'votes_collected'
    end;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'showId', r.id,
      'showName', r.name,
      'showKind', r.kind,
      'sortOrder', r.sort_order,
      'lifecycle', v_state,
      'calculationVersion', r.calculation_version,
      'lastCalculatedAt', r.last_calculated_at,
      'lastCalculatedBy', r.last_calculated_by,
      'reviewedVersion', r.reviewed_version,
      'reviewedAt', r.reviewed_at,
      'reviewedBy', r.reviewed_by,
      'lockedVersion', r.locked_version,
      'lockedAt', r.locked_at,
      'lockedBy', r.locked_by,
      'revealReadyVersion', r.reveal_ready_version,
      'revealReadyAt', r.reveal_ready_at,
      'revealReadyBy', r.reveal_ready_by,
      'preconditions', v_pre
    ));
  end loop;

  return v_rows;
end
$$;

revoke all on function public.studio2_results_operations_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_results_operations_snapshot(uuid)
  to authenticated, service_role;

comment on function public.studio2_results_operations_snapshot(uuid) is
  'Organizer result lifecycle snapshot. Calculated state requires a governed calculation version; legacy rows remain in validation.';

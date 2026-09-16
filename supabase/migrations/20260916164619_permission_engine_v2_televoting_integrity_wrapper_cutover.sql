begin;

-- Permission Engine v2 cutover batch 17.
--
-- Replace the four thin Organizer-only televoting integrity wrappers with
-- edition-scoped capability checks while preserving their existing signed-in
-- requirement, underlying governed workflows, and direct RPC privileges.

create or replace function televoting.organizer_record_integrity_decision(
  p_preflight_id uuid,
  p_decision text,
  p_reason text,
  p_evidence_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;

  if not public.studio2_access_allowed('integrity.manage', v_edition_id, false) then
    raise exception 'Integrity management capability required' using errcode = '42501';
  end if;

  return televoting.record_integrity_decision(
    p_preflight_id,
    p_decision,
    p_reason,
    p_evidence_notes,
    auth.uid()
  );
end;
$$;

create or replace function televoting.organizer_exclude_integrity_ballot(
  p_preflight_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;

  if not public.studio2_access_allowed('televote.ballots.manage', v_edition_id, false) then
    raise exception 'Televote ballot management capability required' using errcode = '42501';
  end if;

  return televoting.exclude_integrity_ballot(p_preflight_id, p_reason, auth.uid());
end;
$$;

create or replace function televoting.organizer_create_integrity_sanction(
  p_preflight_id uuid,
  p_sanction_type text,
  p_expires_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;

  if not public.studio2_access_allowed('integrity.sanction', v_edition_id, false) then
    raise exception 'Integrity sanction capability required' using errcode = '42501';
  end if;

  return televoting.create_integrity_sanction(
    p_preflight_id,
    p_sanction_type,
    p_expires_at,
    p_reason,
    auth.uid()
  );
end;
$$;

create or replace function televoting.organizer_revoke_integrity_sanction(
  p_sanction_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.voter_sanctions s
  join televoting.vote_preflight_checks vpc on vpc.id = s.preflight_id
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where s.id = p_sanction_id
  limit 1;

  if not public.studio2_access_allowed('integrity.sanction', v_edition_id, false) then
    raise exception 'Integrity sanction capability required' using errcode = '42501';
  end if;

  return televoting.revoke_integrity_sanction(p_sanction_id, p_reason, auth.uid());
end;
$$;

revoke all on function televoting.organizer_record_integrity_decision(uuid, text, text, text)
  from public, anon;
grant execute on function televoting.organizer_record_integrity_decision(uuid, text, text, text)
  to authenticated, service_role;

revoke all on function televoting.organizer_exclude_integrity_ballot(uuid, text)
  from public, anon;
grant execute on function televoting.organizer_exclude_integrity_ballot(uuid, text)
  to authenticated, service_role;

revoke all on function televoting.organizer_create_integrity_sanction(uuid, text, timestamptz, text)
  from public, anon;
grant execute on function televoting.organizer_create_integrity_sanction(uuid, text, timestamptz, text)
  to authenticated, service_role;

revoke all on function televoting.organizer_revoke_integrity_sanction(uuid, text)
  from public, anon;
grant execute on function televoting.organizer_revoke_integrity_sanction(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

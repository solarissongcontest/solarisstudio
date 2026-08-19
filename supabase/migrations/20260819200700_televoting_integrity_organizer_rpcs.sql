begin;

-- Browser callers never receive direct table access. These authenticated RPC
-- wrappers verify the Solaris organizer role and then call the internal
-- service-only moderation functions with the real auth.uid() as actor.
create or replace function televoting.organizer_record_integrity_decision(
  p_preflight_id uuid,
  p_decision text,
  p_reason text,
  p_evidence_notes text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'organizer'::public.app_role) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  return televoting.record_integrity_decision(
    p_preflight_id,p_decision,p_reason,p_evidence_notes,auth.uid()
  );
end;
$$;
revoke all on function televoting.organizer_record_integrity_decision(uuid,text,text,text) from public, anon;
grant execute on function televoting.organizer_record_integrity_decision(uuid,text,text,text) to authenticated, service_role;

create or replace function televoting.organizer_exclude_integrity_ballot(
  p_preflight_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'organizer'::public.app_role) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  return televoting.exclude_integrity_ballot(p_preflight_id,p_reason,auth.uid());
end;
$$;
revoke all on function televoting.organizer_exclude_integrity_ballot(uuid,text) from public, anon;
grant execute on function televoting.organizer_exclude_integrity_ballot(uuid,text) to authenticated, service_role;

create or replace function televoting.organizer_create_integrity_sanction(
  p_preflight_id uuid,
  p_sanction_type text,
  p_expires_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'organizer'::public.app_role) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  return televoting.create_integrity_sanction(
    p_preflight_id,p_sanction_type,p_expires_at,p_reason,auth.uid()
  );
end;
$$;
revoke all on function televoting.organizer_create_integrity_sanction(uuid,text,timestamptz,text) from public, anon;
grant execute on function televoting.organizer_create_integrity_sanction(uuid,text,timestamptz,text) to authenticated, service_role;

create or replace function televoting.organizer_revoke_integrity_sanction(
  p_sanction_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'organizer'::public.app_role) then
    raise exception 'Organizer access required' using errcode='42501';
  end if;
  return televoting.revoke_integrity_sanction(p_sanction_id,p_reason,auth.uid());
end;
$$;
revoke all on function televoting.organizer_revoke_integrity_sanction(uuid,text) from public, anon;
grant execute on function televoting.organizer_revoke_integrity_sanction(uuid,text) to authenticated, service_role;

commit;

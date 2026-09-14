begin;

-- Permission Engine v2 strict-dual batch 1.
--
-- Organizer-only high-risk tables enforce the migration rule at the
-- authoritative write boundary: the legacy Organizer role AND the matching
-- capability must both allow the operation. Service-role and trusted migration
-- sessions remain available for backend automation and schema maintenance.

create or replace function private.studio2_require_strict_dual(
  p_capability text,
  p_edition_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := coalesce(auth.role(), '');
  v_decision jsonb;
begin
  if private.studio2_request_is_service_role() then
    return;
  end if;

  -- Direct migration sessions have no JWT role. Browser/API requests always
  -- carry anon or authenticated, so a missing actor there must be rejected.
  if v_actor is null then
    if v_request_role in ('anon', 'authenticated') then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    return;
  end if;

  v_decision := public.studio2_check_capability_shadow(
    p_capability,
    p_edition_id,
    p_action,
    null
  );

  if not coalesce((v_decision ->> 'legacyAllowed')::boolean, false)
     or not coalesce((v_decision ->> 'capabilityAllowed')::boolean, false) then
    raise exception 'Strict dual authorization requires Organizer role and capability: %',
      p_capability
      using errcode = '42501';
  end if;
end
$$;

create or replace function private.studio2_guard_edition_runtime_strict_dual()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_capability text;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_capability := 'edition.manage';
    v_action := 'edition.runtime.provision';
  elsif new.state is distinct from old.state then
    v_capability := case when new.state = 'archived' then 'edition.archive' else 'edition.transition' end;
    v_action := 'edition.runtime.transition';
  else
    v_capability := 'edition.manage';
    v_action := 'edition.runtime.update';
  end if;

  perform private.studio2_require_strict_dual(
    v_capability,
    new.edition_id,
    v_action
  );

  return new;
end
$$;

create or replace function private.studio2_guard_incident_strict_dual()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_capability text;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_capability := 'incident.manage';
    v_action := 'incident.create';
  elsif new.status is distinct from old.status and new.status = 'resolved' then
    v_capability := 'incident.resolve';
    v_action := 'incident.resolve';
  else
    v_capability := 'incident.manage';
    v_action := 'incident.update';
  end if;

  perform private.studio2_require_strict_dual(
    v_capability,
    new.edition_id,
    v_action
  );

  return new;
end
$$;

create or replace function private.studio2_guard_feature_flag_strict_dual()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_existing_scopes uuid[] := case
    when tg_op = 'UPDATE' then coalesce(old.edition_ids, '{}'::uuid[])
    else '{}'::uuid[]
  end;
  v_requested_scopes uuid[] := coalesce(new.edition_ids, '{}'::uuid[]);
  v_scope uuid;
begin
  -- Moving from or to a global flag is itself a global operation. Otherwise,
  -- require dual authorization for every old and requested edition scope.
  if (tg_op = 'UPDATE' and cardinality(v_existing_scopes) = 0)
     or cardinality(v_requested_scopes) = 0 then
    perform private.studio2_require_strict_dual(
      'rollout.manage',
      null,
      'rollout.flag.write'
    );
  else
    for v_scope in
      select distinct affected.scope_id
      from unnest(v_existing_scopes || v_requested_scopes) affected(scope_id)
      where affected.scope_id is not null
    loop
      perform private.studio2_require_strict_dual(
        'rollout.manage',
        v_scope,
        'rollout.flag.write'
      );
    end loop;
  end if;

  return new;
end
$$;

drop trigger if exists studio2_edition_runtime_strict_dual_guard
  on public.studio2_edition_runtime;
create trigger studio2_edition_runtime_strict_dual_guard
before insert or update on public.studio2_edition_runtime
for each row execute function private.studio2_guard_edition_runtime_strict_dual();

drop trigger if exists studio2_incidents_strict_dual_guard
  on public.studio2_incidents;
create trigger studio2_incidents_strict_dual_guard
before insert or update on public.studio2_incidents
for each row execute function private.studio2_guard_incident_strict_dual();

drop trigger if exists studio2_feature_flags_strict_dual_guard
  on public.studio2_feature_flags;
create trigger studio2_feature_flags_strict_dual_guard
before insert or update on public.studio2_feature_flags
for each row execute function private.studio2_guard_feature_flag_strict_dual();

revoke all on function private.studio2_require_strict_dual(text, uuid, text)
  from public, anon, authenticated;
revoke all on function private.studio2_guard_edition_runtime_strict_dual()
  from public, anon, authenticated;
revoke all on function private.studio2_guard_incident_strict_dual()
  from public, anon, authenticated;
revoke all on function private.studio2_guard_feature_flag_strict_dual()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

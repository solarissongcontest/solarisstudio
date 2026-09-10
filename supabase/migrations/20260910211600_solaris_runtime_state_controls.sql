-- Trusted controls for edition subsystems and organizer-managed rollout data.

-- RLS policies in the foundation migration remain the authority. These grants
-- only make the organizer write policies reachable from authenticated clients.
grant insert, update, delete on public.user_capability_grants to authenticated;
grant insert, update, delete on public.platform_feature_flags to authenticated;
grant insert, update, delete on public.platform_feature_flag_overrides to authenticated;

create or replace function public.platform_valid_subsystem_state(
  p_subsystem text,
  p_state text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_subsystem
    when 'confirmations' then p_state in ('not_started', 'open', 'closed', 'locked')
    when 'submissions' then p_state in ('not_started', 'open', 'closed', 'locked')
    when 'jury_voting' then p_state in ('not_started', 'open', 'closed', 'locked')
    when 'televoting' then p_state in ('not_started', 'open', 'closed', 'locked')
    when 'results' then p_state in ('hidden', 'calculating', 'verification', 'verified', 'published')
    else false
  end;
$$;

create or replace function public.update_edition_subsystem_state(
  p_edition_id uuid,
  p_subsystem text,
  p_state text,
  p_reason text default null
)
returns public.edition_runtime_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.edition_runtime_state;
  v_after public.edition_runtime_state;
  v_previous_state text;
begin
  if auth.uid() is null
     or not public.has_platform_capability(auth.uid(), 'edition.manage', p_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  if not public.platform_valid_subsystem_state(p_subsystem, p_state) then
    raise exception 'Invalid state % for subsystem %', p_state, p_subsystem using errcode = '22023';
  end if;

  select * into v_before
  from public.edition_runtime_state
  where edition_id = p_edition_id
  for update;

  if not found then
    raise exception 'Edition runtime state is not initialized' using errcode = 'P0002';
  end if;

  v_previous_state := case p_subsystem
    when 'confirmations' then v_before.confirmations_state
    when 'submissions' then v_before.submissions_state
    when 'jury_voting' then v_before.jury_voting_state
    when 'televoting' then v_before.televoting_state
    when 'results' then v_before.results_state
  end;

  if v_previous_state = p_state then
    return v_before;
  end if;

  update public.edition_runtime_state
  set confirmations_state = case when p_subsystem = 'confirmations' then p_state else confirmations_state end,
      submissions_state = case when p_subsystem = 'submissions' then p_state else submissions_state end,
      jury_voting_state = case when p_subsystem = 'jury_voting' then p_state else jury_voting_state end,
      televoting_state = case when p_subsystem = 'televoting' then p_state else televoting_state end,
      results_state = case when p_subsystem = 'results' then p_state else results_state end,
      version = version + 1,
      last_transition_at = now(),
      last_transition_by = auth.uid(),
      last_transition_reason = p_reason
  where edition_id = p_edition_id
  returning * into v_after;

  insert into public.platform_events (
    edition_id,
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'EDITION_SUBSYSTEM_STATE_CHANGED',
    auth.uid(),
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'subsystem', p_subsystem,
      'from', v_previous_state,
      'to', p_state,
      'version', v_after.version,
      'reason', p_reason
    )
  );

  if to_regclass('public.admin_audit_log') is not null then
    execute $audit$
      insert into public.admin_audit_log (
        actor_id,
        action,
        table_name,
        record_id,
        edition_id,
        before_data,
        after_data
      ) values ($1, $2, $3, $4, $5, $6, $7)
    $audit$
    using
      auth.uid(),
      'update_edition_subsystem_state',
      'edition_runtime_state',
      p_edition_id::text,
      p_edition_id,
      to_jsonb(v_before),
      to_jsonb(v_after);
  end if;

  return v_after;
end;
$$;

grant execute on function public.update_edition_subsystem_state(uuid, text, text, text) to authenticated;

comment on function public.update_edition_subsystem_state(uuid, text, text, text) is
  'Server-validated control for confirmations, submissions, jury voting, televoting and results runtime states.';

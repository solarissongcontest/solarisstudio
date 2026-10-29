begin;

-- S16 Jury authority hardening: one governed R2 command owns validation,
-- semantic mutation, CAS advancement and operation completion.

create or replace function public.studio2_apply_jury_voting_status(
  p_show_id uuid,
  p_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $apply$
declare
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_jury_enabled boolean := true;
  v_allow_self boolean := false;
  v_point_count integer := 0;
  v_participant_count integer := 0;
  v_participating_roster_count integer := 0;
  v_result jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected jury-window version are required'
      using errcode = '22023';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.window.' || p_status,
    'R2',
    jsonb_build_object(
      'editionId', v_show.edition_id,
      'showId', p_show_id,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-jury-window:' || v_show.edition_id::text, 0)
  );

  select coalesce((
    select version_row.version
    from public.studio2_jury_window_versions version_row
    where version_row.edition_id = v_show.edition_id
  ), 0)
  into v_current_version;

  if p_expected_version <> v_current_version then
    raise exception 'Jury voting windows changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  -- Preview is explanatory UX. Re-run the live invariants in the commit.
  v_jury_enabled := coalesce((v_show.voting_config ->> 'juryEnabled')::boolean, true);
  v_allow_self := coalesce((v_show.voting_config ->> 'allowSelfVote')::boolean, false);
  v_point_count := jsonb_array_length(
    coalesce(v_show.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb)
  );

  if p_status = 'open' then
    if not v_jury_enabled then
      raise exception 'Jury voting is disabled for this show' using errcode = '23514';
    end if;

    select count(*)::integer into v_participant_count
    from public.participants participant
    where participant.show_id = p_show_id
      and (participant.participation_status is null or participant.participation_status = 'confirmed');

    if v_participant_count < v_point_count then
      raise exception 'This show does not have enough entries for the configured jury point scale'
        using errcode = '23514';
    end if;

    if not v_allow_self and v_participant_count = v_point_count then
      if not exists (select 1 from public.voters voter where voter.show_id = p_show_id) then
        raise exception 'Add one more entry or shorten the jury point scale because participating juries cannot vote for themselves'
          using errcode = '23514';
      end if;

      select count(*)::integer into v_participating_roster_count
      from public.voters voter
      where voter.show_id = p_show_id
        and exists (
          select 1 from public.participants participant
          where participant.show_id = p_show_id
            and participant.country_id = voter.country_id
            and (participant.participation_status is null or participant.participation_status = 'confirmed')
        );

      if v_participating_roster_count > 0 then
        raise exception 'The configured jury scale leaves participating juries too few eligible entries after self-voting is blocked'
          using errcode = '23514';
      end if;
    end if;

    update public.jury_voting_windows
    set status = 'closed', closed_at = now(), updated_at = now()
    where edition_id = v_show.edition_id
      and show_id <> p_show_id
      and status = 'open';
  end if;

  insert into public.jury_voting_windows (
    show_id, edition_id, status, opened_at, closed_at, opened_by, updated_at
  ) values (
    p_show_id,
    v_show.edition_id,
    p_status,
    case when p_status = 'open' then now() else null end,
    case when p_status = 'closed' then now() else null end,
    case when p_status = 'open' then auth.uid() else null end,
    now()
  )
  on conflict (show_id) do update
  set edition_id = excluded.edition_id,
      status = excluded.status,
      opened_at = case when excluded.status = 'open' then now() else public.jury_voting_windows.opened_at end,
      closed_at = case when excluded.status = 'closed' then now() else null end,
      opened_by = case when excluded.status = 'open' then auth.uid() else public.jury_voting_windows.opened_by end,
      updated_at = now();

  insert into public.studio2_jury_window_versions (edition_id, version, updated_at)
  values (v_show.edition_id, 1, now())
  on conflict (edition_id) do update
  set version = public.studio2_jury_window_versions.version + 1,
      updated_at = excluded.updated_at
  returning version into v_next_version;

  v_result := jsonb_build_object(
    'ok', true,
    'show_id', p_show_id,
    'status', p_status,
    'riskClass', 'R2',
    'operationId', v_operation_id,
    'previousVersion', v_current_version,
    'version', v_next_version
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

alter function public.studio2_apply_jury_voting_status(uuid, text, uuid, text, bigint)
  owner to postgres;
revoke all on function public.studio2_apply_jury_voting_status(uuid, text, uuid, text, bigint)
  from public, anon;
grant execute on function public.studio2_apply_jury_voting_status(uuid, text, uuid, text, bigint)
  to authenticated, service_role;

-- CAS is now advanced once per governed logical operation rather than once for
-- every row touched by the operation.
drop trigger if exists studio2_jury_window_touch_edition_version
  on public.jury_voting_windows;

create or replace function private.studio2_touch_jury_window_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $retired$
begin
  raise exception 'Retired Jury CAS trigger primitive must not be invoked'
    using errcode = '42501';
end
$retired$;
alter function private.studio2_touch_jury_window_version() owner to postgres;
revoke all on function private.studio2_touch_jury_window_version()
  from public, anon, authenticated, service_role;

-- Preserve the old signature only as a fail-closed compatibility tombstone.
-- It no longer writes Jury state and cannot be invoked by API/transport roles.
create or replace function public.admin_set_jury_voting_status(
  _show_id uuid,
  _status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $retired$
begin
  raise exception 'Legacy Jury window mutation is retired; use studio2_apply_jury_voting_status'
    using errcode = '42501';
end
$retired$;
alter function public.admin_set_jury_voting_status(uuid, text) owner to postgres;
revoke all on function public.admin_set_jury_voting_status(uuid, text)
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate
  on table public.studio2_jury_window_versions
  from service_role;

do $proof$
begin
  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.jury_voting_windows'::regclass
      and trigger_row.tgname = 'studio2_jury_window_touch_edition_version'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'S16: obsolete Jury window CAS trigger remains attached';
  end if;

  if has_function_privilege('service_role', 'public.admin_set_jury_voting_status(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_set_jury_voting_status(uuid,text)', 'EXECUTE') then
    raise exception 'S16: retired Jury semantic writer remains externally executable';
  end if;

  if has_function_privilege('service_role', 'private.studio2_touch_jury_window_version()', 'EXECUTE') then
    raise exception 'S16: retired Jury CAS primitive remains externally executable';
  end if;

  if has_table_privilege('service_role', 'public.studio2_jury_window_versions', 'INSERT')
     or has_table_privilege('service_role', 'public.studio2_jury_window_versions', 'UPDATE')
     or has_table_privilege('service_role', 'public.studio2_jury_window_versions', 'DELETE')
     or has_table_privilege('service_role', 'public.studio2_jury_window_versions', 'TRUNCATE') then
    raise exception 'S16: service_role retains raw DML on Jury window versions';
  end if;
end;
$proof$;

commit;

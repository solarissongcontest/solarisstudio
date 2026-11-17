begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- S16 P08: retire the only service-role-executable second jury-window writer.
-- The R2 wrapper retains its actor/edition authorization, operation identity,
-- expected version, edition transaction lock, receipt and idempotent replay.
do $preflight$
declare v_old oid:=to_regprocedure('public.admin_set_jury_voting_status(uuid,text)');
        v_owner oid:=to_regprocedure('public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)');
begin
 if v_old is null or v_owner is null
 or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='admin_set_jury_voting_status')<>1
 or exists(select 1 from pg_proc p where p.oid in(v_old,v_owner) and
   (not p.prosecdef or pg_get_userbyid(p.proowner)<>'postgres'))
 or not exists(select 1 from pg_proc p where p.oid=v_old
   and pg_get_functiondef(p.oid) like '%update public.jury_voting_windows%'
   and pg_get_functiondef(p.oid) like '%insert into public.jury_voting_windows%')
 or not exists(select 1 from pg_proc p where p.oid=v_owner
   and pg_get_functiondef(p.oid) like '%v_change := public.admin_set_jury_voting_status(p_show_id, p_status)%'
   and pg_get_functiondef(p.oid) like '%PT409%'
   and p.proconfig @> array['search_path=pg_catalog, public, private']::text[])
 or not has_function_privilege('authenticated',v_owner,'EXECUTE')
 or not has_function_privilege('service_role',v_old,'EXECUTE')
 then raise exception 'Unqualified Jury legacy/R2 owner or source definition; refuse cutover' using errcode='55000';end if;
 if to_regclass('public.studio2_jury_window_versions') is null
 or not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
   where c.oid='public.jury_voting_windows'::regclass
     and t.tgname='studio2_jury_window_touch_edition_version'
     and t.tgenabled='O' and not t.tgisinternal)
 then raise exception 'Jury CAS/version trigger missing; refuse cutover' using errcode='55000';end if;
end $preflight$;

select public.v3_register_migration_contract('v3.jury.r2-single-writer-retirement', 1,
 'forward_fix_only', false, null,
 'Inline reviewer-checked jury-window mutation into R2 receipt command and physically retire service-role legacy RPC');

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
set search_path = pg_catalog, public, private
as $apply$
declare
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_change jsonb;
  v_result jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected jury-window version are required'
      using errcode = '22023';
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id;

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
      using errcode = 'PT409';
  end if;

  -- Inline the final reviewed legacy preflight and mutation under the R2
  -- edition lock. No second callable RPC or service-role bypass remains.
  <<governed_window_mutation>>
  declare
    target_show public.shows;
    participant_count integer;
    point_count integer;
    jury_enabled boolean;
    allow_self boolean;
    participating_roster_count integer;
  begin
    select * into target_show
    from public.shows
    where id = _show_id;
  
    if not public.studio2_access_allowed('voting.manage', target_show.edition_id, true) then
      raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
    end if;
  
    if _status not in ('open', 'closed') then
      raise exception 'Invalid jury voting status';
    end if;
  
    if target_show is null then
      raise exception 'Show not found';
    end if;
  
    jury_enabled := coalesce((target_show.voting_config ->> 'juryEnabled')::boolean, true);
    allow_self := coalesce((target_show.voting_config ->> 'allowSelfVote')::boolean, false);
    point_count := jsonb_array_length(
      coalesce(target_show.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb)
    );
  
    if _status = 'open' and not jury_enabled then
      raise exception 'Jury voting is disabled for this show';
    end if;
  
    if _status = 'open' then
      select count(*) into participant_count
      from public.participants p
      where p.show_id = _show_id
        and (p.participation_status is null or p.participation_status = 'confirmed');
  
      if participant_count < point_count then
        raise exception 'This show does not have enough entries for the configured jury point scale';
      end if;
  
      if not allow_self and participant_count = point_count then
        if not exists (select 1 from public.voters where show_id = _show_id) then
          raise exception 'Add one more entry or shorten the jury point scale because participating juries cannot vote for themselves';
        end if;
  
        select count(*) into participating_roster_count
        from public.voters v
        where v.show_id = _show_id
          and exists (
            select 1 from public.participants p
            where p.show_id = _show_id
              and p.country_id = v.country_id
              and (p.participation_status is null or p.participation_status = 'confirmed')
          );
  
        if participating_roster_count > 0 then
          raise exception 'The configured jury scale leaves participating juries too few eligible entries after self-voting is blocked';
        end if;
      end if;
  
      update public.jury_voting_windows
        set status = 'closed', closed_at = now(), updated_at = now()
      where edition_id = target_show.edition_id
        and show_id <> _show_id
        and status = 'open';
    end if;
  
    insert into public.jury_voting_windows (
      show_id, edition_id, status, opened_at, closed_at, opened_by, updated_at
    ) values (
      _show_id,
      target_show.edition_id,
      _status,
      case when _status = 'open' then now() else null end,
      case when _status = 'closed' then now() else null end,
      case when _status = 'open' then auth.uid() else null end,
      now()
    )
    on conflict (show_id) do update set
      edition_id = excluded.edition_id,
      status = excluded.status,
      opened_at = case when excluded.status = 'open' then now() else jury_voting_windows.opened_at end,
      closed_at = case when excluded.status = 'closed' then now() else null end,
      opened_by = case when excluded.status = 'open' then auth.uid() else jury_voting_windows.opened_by end,
      updated_at = now();
  
    v_change := jsonb_build_object('ok', true, 'show_id', _show_id, 'status', _status);
  end governed_window_mutation;


  select coalesce((
    select version_row.version
    from public.studio2_jury_window_versions version_row
    where version_row.edition_id = v_show.edition_id
  ), v_current_version)
  into v_next_version;

  v_result := coalesce(v_change, '{}'::jsonb) || jsonb_build_object(
    'riskClass', 'R2',
    'operationId', v_operation_id,
    'previousVersion', v_current_version,
    'version', v_next_version
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

-- RESTRICT aborts on any discovered SQL dependency. Do not use CASCADE.
drop function public.admin_set_jury_voting_status(uuid,text) restrict;

do $postflight$
declare v_owner oid:=to_regprocedure('public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)');
begin
 if to_regprocedure('public.admin_set_jury_voting_status(uuid,text)') is not null
 or v_owner is null
 or not has_function_privilege('authenticated',v_owner,'EXECUTE')
 or has_function_privilege('anon',v_owner,'EXECUTE')
 or not exists(select 1 from pg_proc p where p.oid=v_owner and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and pg_get_functiondef(p.oid) like '%on conflict (show_id) do update%'
      and pg_get_functiondef(p.oid) like '%private.studio2_complete_operation%'
      and pg_get_functiondef(p.oid) not like '%v_change := public.admin_set_jury_voting_status%')
 then raise exception 'Jury single-writer postflight failed' using errcode='55000';end if;
end $postflight$;
notify pgrst,'reload schema';
commit;

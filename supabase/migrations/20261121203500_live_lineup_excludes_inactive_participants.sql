begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Withdrawn/disqualified rows remain intact for audit and historical editions,
-- but do not consume a slot in live show allocation or running order.
-- Only the existing authenticated entry.edit capability can mutate these RPCs.
create or replace function public.admin_set_show_running_order(
  _show_id uuid,
  _participant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id into v_edition_id from public.shows s where s.id = _show_id;
  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  select count(*)::integer into v_expected
  from public.participants p
  where p.show_id = _show_id and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  v_supplied := coalesce(array_length(_participant_ids, 1), 0);
  select count(distinct x)::integer into v_distinct
  from unnest(coalesce(_participant_ids, '{}'::uuid[])) as x;

  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Running order must contain every active show participant exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_participant_ids, '{}'::uuid[])) as supplied(id)
    left join public.participants p on p.id = supplied.id
      and p.show_id = _show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
    where p.id is null
  ) then
    raise exception 'Running order contains an inactive participant or a participant from another show.' using errcode = '22023';
  end if;

  -- One statement keeps the existing statement-level result-sync batching.
  -- Inactive rows receive NULL, never a hidden trailing order number.
  with desired as (
    select supplied.id, supplied.ordinality::integer as position
    from unnest(coalesce(_participant_ids, '{}'::uuid[]))
      with ordinality as supplied(id, ordinality)
  )
  update public.participants p
     set running_order = (select d.position from desired d where d.id = p.id),
         updated_at = now()
   where p.show_id = _show_id
     and p.running_order is distinct from (select d.position from desired d where d.id = p.id);
end;
$function$;

create or replace function public.admin_set_show_allocations(
  _show_id uuid,
  _allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
begin
  select s.edition_id into v_edition_id from public.shows s where s.id = _show_id;
  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Allocations must be an array.' using errcode = '22023';
  end if;

  select count(*)::integer into v_expected
  from public.participants p
  where p.show_id = _show_id and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  select count(*)::integer, count(distinct item.id)::integer into v_supplied, v_distinct
  from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text);
  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Allocation draw must contain every active show participant exactly once.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text)
    left join public.participants p on p.id = item.id
      and p.show_id = _show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
    where p.id is null or item.allocation not in ('first_half', 'second_half', 'producer_choice')
  ) then
    raise exception 'Allocation draw contains an inactive/invalid participant or allocation.' using errcode = '22023';
  end if;

  with desired as (
    select item.id, item.allocation
    from jsonb_to_recordset(coalesce(_allocations, '[]'::jsonb)) as item(id uuid, allocation text)
  )
  update public.participants p
     set running_order_allocation = (select d.allocation from desired d where d.id = p.id),
         updated_at = now()
   where p.show_id = _show_id
     and p.running_order_allocation is distinct from (select d.allocation from desired d where d.id = p.id);
end;
$function$;

revoke all on function public.admin_set_show_running_order(uuid, uuid[]) from public, anon;
revoke all on function public.admin_set_show_allocations(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_show_running_order(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_set_show_allocations(uuid, jsonb) to authenticated, service_role;
-- Country-account jury eligibility must also exclude inactive voting
-- countries even if a stale explicit voter roster still contains them.
-- Fail closed on unexpected function changes to avoid clobbering live logic.
do $guard$
begin
  if encode(sha256(convert_to(pg_get_functiondef('public.country_jury_voting_context()'::regprocedure),'UTF8')),'hex') <> 'e799bd12ce08a7b755d88e49e6d2ed2039abad005862939c6ad6d307c1ff1fe7' then
    raise exception 'Country jury context definition drift; review before cutover' using errcode = '55000';
  end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.country_jury_voting_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  account_row public.country_accounts;
  country_row public.countries;
  rounds jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into account_row
  from public.country_accounts
  where user_id = auth.uid()
  limit 1;

  if account_row is null then
    return jsonb_build_object('ok', false, 'error', 'country_account_required');
  end if;

  if coalesce(account_row.status, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_suspended');
  end if;

  select * into country_row from public.countries where id = account_row.country_id;

  select coalesce(jsonb_agg(round_data order by edition_number desc, show_order asc), '[]'::jsonb)
  into rounds
  from (
    select
      e.edition_number,
      s.sort_order as show_order,
      jsonb_build_object(
        'show_id', s.id,
        'show_name', s.name,
        'show_kind', s.kind,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'status', coalesce(w.status, 'closed'),
        'opened_at', w.opened_at,
        'closed_at', w.closed_at,
        'point_scale', coalesce(s.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb),
        'allow_self_vote', coalesce((s.voting_config ->> 'allowSelfVote')::boolean, false),
        'eligible', (not exists (
          select 1 from public.participants inactive
          where inactive.edition_id = e.id
            and inactive.country_id = account_row.country_id
            and inactive.participation_status in ('withdrawn', 'disqualified')
        ) and case
          when exists (select 1 from public.voters vr where vr.show_id = s.id)
            then exists (
              select 1 from public.voters vr
              where vr.show_id = s.id and vr.country_id = account_row.country_id
            )
          else exists (
            select 1 from public.participants pp
            where pp.show_id = s.id
              and pp.country_id = account_row.country_id
              and (pp.participation_status is null or pp.participation_status = 'confirmed')
          )
        end),
        'already_submitted', (
          exists (
            select 1 from public.jury_ballot_submissions bs
            where bs.show_id = s.id and bs.voter_country_id = account_row.country_id
          )
          or exists (
            select 1 from public.jury_votes jv
            where jv.show_id = s.id and jv.voter_country_id = account_row.country_id
          )
        ),
        'entries', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'country_id', c.id,
            'name', c.name,
            'short_code', c.short_code,
            'flag_image', c.flag_image,
            'artist', p.artist,
            'song', p.song,
            'running_order', p.running_order
          ) order by coalesce(p.running_order, 9999), c.name), '[]'::jsonb)
          from public.participants p
          join public.countries c on c.id = p.country_id
          where p.show_id = s.id
            and (p.participation_status is null or p.participation_status = 'confirmed')
        )
      ) as round_data
    from public.shows s
    join public.editions e on e.id = s.edition_id
    left join public.jury_voting_windows w on w.show_id = s.id
    where e.status = 'active'
      and coalesce((s.voting_config ->> 'juryEnabled')::boolean, true)
  ) q;

  return jsonb_build_object(
    'ok', true,
    'country', jsonb_build_object(
      'id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code,
      'flag_image', country_row.flag_image,
      'username', coalesce(nullif(account_row.instagram_username, ''), nullif(account_row.display_name, ''), country_row.short_code)
    ),
    'rounds', rounds
  );
end;
$function$;

-- Authoritative write guard, independent of cached Organizer/browser rosters.
-- Historical accepted submissions are not modified or deleted.
create or replace function private.v3_reject_inactive_country_jury_ballot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if exists (
    select 1 from public.participants p
    where p.edition_id = new.edition_id
      and p.country_id = new.voter_country_id
      and p.participation_status in ('withdrawn', 'disqualified')
  ) then
    raise exception 'Withdrawn or disqualified countries cannot submit official Jury ballots'
      using errcode = '42501';
  end if;
  return new;
end;
$trigger$;

revoke all on function private.v3_reject_inactive_country_jury_ballot() from public, anon, authenticated, service_role;
drop trigger if exists v3_reject_inactive_country_jury_ballot on public.jury_ballot_submissions;
create trigger v3_reject_inactive_country_jury_ballot
  before insert on public.jury_ballot_submissions
  for each row execute function private.v3_reject_inactive_country_jury_ballot();

notify pgrst, 'reload schema';
commit;

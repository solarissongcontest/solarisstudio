-- Final release hardening for country-account HOD history.
-- Production already contains these stricter definitions; this migration keeps
-- source control and any future environments in the same state.

alter table public.editions
  add column if not exists design_config jsonb not null default '{}'::jsonb;

create or replace function public.set_owned_hod_edition_status(_edition_id uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_country uuid;
  v_person uuid;
  v_existing public.delegation_hod_assignments;
begin
  if _status not in ('mine','other','unknown') then raise exception 'Invalid HOD status' using errcode='22023'; end if;
  if v_user is null then raise exception 'Sign in first' using errcode='42501'; end if;

  select country_id into v_country
  from public.country_accounts
  where user_id=v_user and status='active';
  if v_country is null then raise exception 'No active country account' using errcode='42501'; end if;

  if not exists (
    select 1 from public.participants
    where edition_id=_edition_id and country_id=v_country and participation_status='confirmed'
  ) then
    raise exception 'Your country did not participate in that edition' using errcode='22023';
  end if;

  v_person := public.ensure_account_hod_person(v_user);
  select * into v_existing
  from public.delegation_hod_assignments
  where edition_id=_edition_id and country_id=v_country and channel='delegation';

  if v_existing.id is not null and v_existing.source not in ('country-account-self','country-account-auto') then
    if _status='mine' and v_existing.person_id=v_person then
      null;
    elsif _status='other' and v_existing.person_id<>v_person then
      null;
    else
      raise exception 'This edition has organizer-verified HOD history. Ask an organizer to change it.' using errcode='42501';
    end if;
  elsif _status='mine' then
    insert into public.delegation_hod_assignments(edition_id,country_id,person_id,channel,source,confidence,notes)
    values(_edition_id,v_country,v_person,'delegation','country-account-self',100,'Confirmed by the country HOD')
    on conflict(edition_id,country_id,channel)
    do update set person_id=excluded.person_id,source=excluded.source,confidence=100,notes=excluded.notes,updated_at=now();
  else
    delete from public.delegation_hod_assignments
    where edition_id=_edition_id and country_id=v_country and channel='delegation'
      and source in ('country-account-self','country-account-auto');
  end if;

  insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
  values(v_user,v_country,_edition_id,_status,now())
  on conflict(user_id,country_id,edition_id)
  do update set status=excluded.status,updated_at=now();

  return true;
end;
$$;

create or replace function public.owned_hod_edition_history()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_country uuid;
  v_auto boolean;
  v_self_person uuid;
  v_result jsonb;
begin
  if v_user is null then raise exception 'Sign in first' using errcode='42501'; end if;

  select country_id,hod_auto_assign_future into v_country,v_auto
  from public.country_accounts
  where user_id=v_user and status='active';
  if v_country is null then raise exception 'No active country account' using errcode='42501'; end if;

  select id into v_self_person
  from public.delegation_people
  where identity_key='account:' || v_user::text;

  select jsonb_build_object(
    'country_id',v_country,
    'auto_assign_future',coalesce(v_auto,true),
    'editions',coalesce(jsonb_agg(jsonb_build_object(
      'edition_id',q.edition_id,
      'edition_number',q.edition_number,
      'edition_name',q.edition_name,
      'status',q.status
    ) order by q.edition_number desc nulls last),'[]'::jsonb)
  ) into v_result
  from (
    select distinct e.id edition_id,e.edition_number,e.name edition_name,
      coalesce(c.status,
        case
          when a.person_id=v_self_person and v_self_person is not null then 'mine'
          when a.person_id is not null then 'other'
          else 'unknown'
        end
      ) status
    from public.participants p
    join public.editions e on e.id=p.edition_id
    left join public.country_hod_edition_claims c
      on c.user_id=v_user and c.country_id=v_country and c.edition_id=e.id
    left join public.delegation_hod_assignments a
      on a.edition_id=e.id and a.country_id=v_country and a.channel='delegation'
    where p.country_id=v_country and p.participation_status='confirmed'
  ) q;

  return coalesce(v_result,jsonb_build_object(
    'country_id',v_country,
    'auto_assign_future',coalesce(v_auto,true),
    'editions','[]'::jsonb
  ));
end;
$$;

create or replace function public.auto_assign_country_hod_for_participation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid;
  v_person uuid;
  v_status text;
  v_existing public.delegation_hod_assignments;
begin
  if new.country_id is null
     or new.show_id is not null
     or new.participation_status <> 'confirmed' then
    return new;
  end if;

  select user_id into v_user
  from public.country_accounts
  where country_id=new.country_id
    and status='active'
    and hod_auto_assign_future=true
  limit 1;
  if v_user is null then return new; end if;

  select status into v_status
  from public.country_hod_edition_claims
  where user_id=v_user and country_id=new.country_id and edition_id=new.edition_id;
  if v_status in ('other','unknown') then return new; end if;

  v_person := public.ensure_account_hod_person(v_user);

  select * into v_existing
  from public.delegation_hod_assignments
  where edition_id=new.edition_id and country_id=new.country_id and channel='delegation';

  if v_existing.id is not null and v_existing.person_id <> v_person then
    insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
    values(v_user,new.country_id,new.edition_id,'other',now())
    on conflict(user_id,country_id,edition_id)
    do update set status='other',updated_at=now();
    return new;
  end if;

  insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
  values(v_user,new.country_id,new.edition_id,'mine',now())
  on conflict(user_id,country_id,edition_id) do nothing;

  if v_existing.id is null then
    insert into public.delegation_hod_assignments(edition_id,country_id,person_id,channel,source,confidence,notes)
    values(new.edition_id,new.country_id,v_person,'delegation','country-account-auto',100,'Automatically carried forward for active HOD')
    on conflict(edition_id,country_id,channel) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists participants_auto_assign_country_hod on public.participants;
create trigger participants_auto_assign_country_hod
after insert or update of country_id,edition_id,participation_status,show_id on public.participants
for each row execute function public.auto_assign_country_hod_for_participation();

revoke all on function public.ensure_account_hod_person(uuid) from public, anon, authenticated;
revoke all on function public.auto_assign_country_hod_for_participation() from public, anon, authenticated;
revoke all on function public.owned_hod_edition_history() from public, anon;
revoke all on function public.set_owned_hod_edition_status(uuid,text) from public, anon;
revoke all on function public.set_owned_hod_auto_assign(boolean) from public, anon;
grant execute on function public.owned_hod_edition_history() to authenticated;
grant execute on function public.set_owned_hod_edition_status(uuid,text) to authenticated;
grant execute on function public.set_owned_hod_auto_assign(boolean) to authenticated;

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

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
  v_existing_person uuid;
begin
  if new.country_id is null then return new; end if;

  select user_id into v_user
  from public.country_accounts
  where country_id=new.country_id and status='active' and hod_auto_assign_future=true
  limit 1;
  if v_user is null then return new; end if;

  select status into v_status
  from public.country_hod_edition_claims
  where user_id=v_user and country_id=new.country_id and edition_id=new.edition_id;
  if v_status in ('other','unknown') then return new; end if;

  v_person := public.ensure_account_hod_person(v_user);

  select person_id into v_existing_person
  from public.delegation_hod_assignments
  where edition_id=new.edition_id and country_id=new.country_id and channel='delegation';

  if v_existing_person is not null and v_existing_person <> v_person then
    insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
    values(v_user,new.country_id,new.edition_id,'other',now())
    on conflict(user_id,country_id,edition_id)
    do update set status='other', updated_at=now();
    return new;
  end if;

  insert into public.country_hod_edition_claims(user_id,country_id,edition_id,status,updated_at)
  values(v_user,new.country_id,new.edition_id,'mine',now())
  on conflict(user_id,country_id,edition_id) do nothing;

  insert into public.delegation_hod_assignments(edition_id,country_id,person_id,channel,source,confidence,notes)
  values(new.edition_id,new.country_id,v_person,'delegation','country-account-auto',100,'Automatically carried forward for active HOD')
  on conflict(edition_id,country_id,channel) do nothing;

  return new;
end;
$$;

revoke all on function public.auto_assign_country_hod_for_participation() from public, anon, authenticated;

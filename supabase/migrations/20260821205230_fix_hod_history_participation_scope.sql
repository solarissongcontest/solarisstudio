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
    where p.country_id=v_country
      and p.participation_status='confirmed'
  ) q;

  return coalesce(v_result,jsonb_build_object(
    'country_id',v_country,
    'auto_assign_future',coalesce(v_auto,true),
    'editions','[]'::jsonb
  ));
end;
$$;

revoke all on function public.owned_hod_edition_history() from public, anon;
grant execute on function public.owned_hod_edition_history() to authenticated;

drop trigger if exists participants_auto_assign_country_hod on public.participants;
create trigger participants_auto_assign_country_hod
after insert or update of country_id,edition_id,participation_status,show_id on public.participants
for each row execute function public.auto_assign_country_hod_for_participation();

create or replace function televoting.admin_rounds_page_overview(
  p_solaris_edition_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'organizer'::public.app_role) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  with selected as (
    select e.id as solaris_id, e.name as solaris_name, e.edition_number
    from public.editions e
    where e.id = p_solaris_edition_id
    limit 1
  ),
  remote as (
    select
      s.solaris_id,
      s.solaris_name,
      s.edition_number,
      te.id as remote_id,
      te.is_active,
      te.is_archived
    from selected s
    left join public.integration_links il
      on il.service = 'televoting'
     and il.entity_type = 'edition'
     and il.solaris_id = s.solaris_id
    left join televoting.editions te
      on te.id::text = il.remote_id
    limit 1
  ),
  round_rows as (
    select
      r.id,
      r.edition_id,
      r.name,
      r.status,
      r.opened_at,
      r.closed_at,
      r.participant_mode,
      r.self_voting_mode,
      r.created_at,
      count(re.id)::int as entry_count
    from remote rm
    join televoting.rounds r on r.edition_id = rm.remote_id
    left join televoting.round_entries re on re.round_id = r.id
    group by r.id
  )
  select jsonb_build_object(
    'linked', coalesce((select remote_id is not null from remote), false),
    'edition', (
      select case
        when remote_id is null then null
        else jsonb_build_object(
          'id', remote_id,
          'solaris_id', solaris_id,
          'name', solaris_name,
          'edition_number', edition_number,
          'is_active', is_active,
          'is_archived', is_archived
        )
      end
      from remote
    ),
    'rounds', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'edition_id', edition_id,
          'name', name,
          'status', status,
          'opened_at', opened_at,
          'closed_at', closed_at,
          'participant_mode', participant_mode,
          'self_voting_mode', self_voting_mode,
          'entry_count', entry_count
        )
        order by created_at
      )
      from round_rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function televoting.admin_rounds_page_overview(uuid) from public, anon, service_role;
grant execute on function televoting.admin_rounds_page_overview(uuid) to authenticated;

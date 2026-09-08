-- Keep the Solaris Organizer voting overview to one PostgREST request and make
-- it follow the edition selected in the canonical Solaris workspace.
create or replace function televoting.admin_overview_summary(
  p_solaris_edition_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with canonical as (
    select e.id as solaris_id, e.name, e.edition_number
    from public.editions e
    where
      (p_solaris_edition_id is not null and e.id = p_solaris_edition_id)
      or (
        p_solaris_edition_id is null
        and e.status = 'active'
        and e.edition_number is not null
      )
    order by
      case when p_solaris_edition_id is not null and e.id = p_solaris_edition_id then 0 else 1 end,
      e.edition_number desc nulls last
    limit 1
  ),
  remote as (
    select
      c.solaris_id,
      c.name as canonical_name,
      c.edition_number,
      te.id as remote_id,
      te.name as remote_name
    from canonical c
    left join public.integration_links il
      on il.service = 'televoting'
     and il.entity_type = 'edition'
     and il.solaris_id = c.solaris_id
    left join televoting.editions te
      on te.id::text = il.remote_id
    limit 1
  ),
  round_scope as (
    select r.id, r.status
    from televoting.rounds r
    join remote rm on rm.remote_id = r.edition_id
  )
  select jsonb_build_object(
    'editions', (select count(*)::int from televoting.editions),
    'rounds', (select count(*)::int from round_scope),
    'openRounds', (select count(*)::int from round_scope where status = 'open'),
    'submissions', (
      select count(*)::int
      from televoting.vote_submissions v
      join round_scope rs on rs.id = v.round_id
    ),
    'blocked', (
      select count(*)::int
      from televoting.anti_abuse_events a
      join round_scope rs on rs.id = a.round_id
      where a.status = 'blocked'
    ),
    'activeEdition', (select canonical_name from remote),
    'remoteEditionId', (select remote_id from remote),
    'linked', coalesce((select remote_id is not null from remote), false)
  );
$$;

revoke execute on function televoting.admin_overview_summary(uuid) from public, anon;
grant execute on function televoting.admin_overview_summary(uuid) to authenticated;

-- Historical Solaris editions can remain status='active' for archival reasons.
-- Televoting, however, has always treated is_active as a single current-edition
-- selector. Repair old projections by choosing the highest-numbered canonical
-- active edition, without hard-coding any generated IDs.
with current_remote as (
  select te.id
  from public.editions pe
  join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.solaris_id = pe.id
  join televoting.editions te on te.id::text = il.remote_id
  where pe.status = 'active'
    and pe.edition_number is not null
  order by pe.edition_number desc
  limit 1
)
update televoting.editions e
set is_active = (e.id = (select id from current_remote)),
    updated_at = now()
where e.is_active is distinct from (e.id = (select id from current_remote));

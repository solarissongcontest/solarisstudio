begin;

-- Search is an independently reversible App V3 capability. Keep every prior
-- Studio 2/V3 key valid while adding the Search rollout key disabled by default.
alter table public.studio2_feature_flags
  drop constraint if exists studio2_feature_flags_key_check;

alter table public.studio2_feature_flags
  add constraint studio2_feature_flags_key_check check (
    key in (
      'edition_state_engine', 'contest_event_engine', 'permission_engine_v2',
      'workflow_engine', 'official_communications', 'hod_workspace_v2',
      'live_control_room', 'incident_command', 'broadcast_rundown',
      'results_replay', 'voting_lab', 'edition_simulator', 'rules_engine',
      'public_encyclopedia', 'public_ia_v3', 'country_voting_dna',
      'prediction_league', 'fantasy_ssc', 'time_machine',
      'solaris_command_assistant', 'solaris_app_v3',
      'solaris_app_v3_confirmation', 'solaris_app_v3_scoreboard',
      'solaris_app_v3_account_settings', 'solaris_app_v3_explore',
      'solaris_app_v3_notifications', 'solaris_app_v3_edition_hub',
      'solaris_app_v3_delegation', 'solaris_app_v3_search'
    )
  );

insert into public.studio2_feature_flags (
  key,
  enabled,
  admins_only,
  user_ids,
  edition_ids
)
values (
  'solaris_app_v3_search',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

-- Keep the established lightweight installed-app Search contract, but delegate
-- entry disclosure to public_safe_participants instead of reading raw
-- participants directly. This makes Search obey the same artist/song and
-- participant publication gates as the newer public V3 surfaces.
create or replace function public.solaris_public_search(
  search_query text,
  result_limit integer default 30
)
returns table (
  result_id text,
  result_type text,
  title text,
  subtitle text,
  href text,
  keywords text,
  sort_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select lower(trim(coalesce(search_query, ''))) as term
  ),
  safe_participant_rows as (
    select
      row.id,
      row.edition_id,
      row.show_id,
      row.country_id,
      row.artist,
      row.song
    from jsonb_to_recordset(public.public_safe_participants(null, null)) as row(
      id uuid,
      edition_id uuid,
      show_id uuid,
      country_id uuid,
      artist text,
      song text
    )
    where row.country_id is not null
      and (nullif(row.artist, '') is not null or nullif(row.song, '') is not null)
  ),
  safe_entries as (
    select distinct on (p.edition_id, p.country_id)
      p.id,
      p.edition_id,
      p.country_id,
      p.artist,
      p.song
    from safe_participant_rows p
    order by p.edition_id, p.country_id, p.show_id nulls first, p.id
  ),
  items as (
    select
      'country:' || c.id::text as result_id,
      'country'::text as result_type,
      c.name::text as title,
      concat_ws(' · ', nullif(c.short_code, ''), nullif(c.region, ''))::text as subtitle,
      ('/countries/' || c.short_code)::text as href,
      lower(concat_ws(' ', c.name, c.native_name, c.short_code, c.region))::text as keywords
    from public.countries c

    union all

    select
      'wiki:' || c.id::text,
      'wiki'::text,
      (c.name || ' in the Wiki')::text,
      'Detailed country article'::text,
      ('/wiki/' || c.short_code)::text,
      lower(concat_ws(' ', c.name, c.native_name, c.short_code, c.region, 'wiki article'))::text
    from public.countries c

    union all

    select
      'edition:' || e.id::text,
      'edition'::text,
      ('SSC ' || coalesce(e.edition_number::text, '—') || ' · ' || e.name)::text,
      concat_ws(' · ', nullif(e.host_city, ''), e.year::text)::text,
      ('/editions/' || e.slug)::text,
      lower(concat_ws(' ', e.name, e.slug, e.edition_number::text, e.year::text, e.host_city, 'ssc edition'))::text
    from public.editions e
    where coalesce(e.published, false)

    union all

    select
      'show:' || s.id::text,
      'show'::text,
      s.name::text,
      ('SSC ' || coalesce(e.edition_number::text, '—'))::text,
      ('/shows/' || s.id::text)::text,
      lower(concat_ws(' ', s.name, s.kind, e.name, e.edition_number::text, 'show'))::text
    from public.shows s
    join public.editions e on e.id = s.edition_id
    where coalesce(s.published, false)
      and coalesce(e.published, false)

    union all

    select
      'entry:' || p.id::text,
      'entry'::text,
      concat_ws(' — ', nullif(p.artist, ''), nullif(p.song, ''))::text,
      concat_ws(' · ', c.name, 'SSC ' || coalesce(e.edition_number::text, '—'))::text,
      ('/countries/' || c.short_code)::text,
      lower(concat_ws(' ', p.artist, p.song, c.name, c.short_code, e.name, e.edition_number::text, 'entry artist song'))::text
    from safe_entries p
    join public.countries c on c.id = p.country_id
    join public.editions e on e.id = p.edition_id
    where coalesce(e.published, false)
  ),
  matched as (
    select
      items.*,
      case
        when input.term = '' then 100
        when lower(items.title) = input.term then 0
        when lower(items.title) like input.term || '%' then 10
        when items.keywords like '% ' || input.term || '%' then 20
        else 30
      end as sort_rank
    from items
    cross join input
    where input.term <> ''
      and items.keywords like '%' || input.term || '%'
  )
  select
    matched.result_id,
    matched.result_type,
    matched.title,
    matched.subtitle,
    matched.href,
    matched.keywords,
    matched.sort_rank
  from matched
  order by matched.sort_rank, matched.title
  limit least(greatest(coalesce(result_limit, 30), 1), 50);
$$;

revoke all on function public.solaris_public_search(text, integer) from public;
grant execute on function public.solaris_public_search(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

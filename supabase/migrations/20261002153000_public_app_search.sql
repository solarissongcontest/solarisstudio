-- Lightweight public search for the installed app.
-- Keeps search from downloading the full SSC archive merely to find an entity.

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
    from public.participants p
    join public.countries c on c.id = p.country_id
    join public.editions e on e.id = p.edition_id
    where p.show_id is null
      and p.publication_status = 'published'
      and coalesce(e.published, false)
      and (nullif(p.artist, '') is not null or nullif(p.song, '') is not null)
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

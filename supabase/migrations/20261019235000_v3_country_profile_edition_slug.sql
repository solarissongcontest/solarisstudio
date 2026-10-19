begin;

-- Public V3 P8/P40 bridge: keep the existing bounded publication-safe country
-- projection authoritative while exposing the canonical published edition slug
-- needed for exact historical deep links. No browser slug inference is allowed.
select public.v3_register_migration_contract(
  'v3.country-profile-edition-slug',
  1,
  'forward_fix_only',
  false,
  null,
  'Backward-compatible read projection extension; adds canonical published edition_slug only'
);

create or replace function public.v3_public_country_profile(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with country_row as (
    select
      c.id,
      c.name,
      c.native_name,
      c.short_code,
      c.flag_image,
      c.region,
      c.accent_color,
      c.description
    from public.countries c
    where upper(c.short_code) = upper(trim(coalesce(p_code, '')))
    limit 1
  ), safe_rows as (
    select item.value as participant
    from country_row c
    cross join lateral jsonb_array_elements(
      public.public_safe_participants(null, null)
    ) as item(value)
    where item.value ->> 'country_id' = c.id::text
  ), ranked as (
    select
      participant,
      row_number() over (
        partition by participant ->> 'edition_id'
        order by
          case when nullif(participant ->> 'show_id', '') is null then 0 else 1 end,
          coalesce(nullif(participant ->> 'running_order', '')::integer, 2147483647),
          participant ->> 'id'
      ) as row_rank
    from safe_rows
  ), entry_rows as (
    select
      e.id as edition_id,
      e.slug as edition_slug,
      e.edition_number,
      e.name as edition_name,
      r.participant ->> 'artist' as artist,
      r.participant ->> 'song' as song,
      coalesce(nullif(r.participant ->> 'participation_status', ''), 'confirmed') as participation_status
    from ranked r
    join public.editions e
      on e.id = (r.participant ->> 'edition_id')::uuid
     and e.published = true
    where r.row_rank = 1
  )
  select case
    when c.id is null then null
    else jsonb_build_object(
      'country', jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'native_name', c.native_name,
        'short_code', c.short_code,
        'flag_image', c.flag_image,
        'region', c.region,
        'accent_color', c.accent_color,
        'description', c.description
      ),
      'entries', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'edition_id', er.edition_id,
            'edition_slug', er.edition_slug,
            'edition_number', er.edition_number,
            'edition_name', er.edition_name,
            'artist', er.artist,
            'song', er.song,
            'participation_status', er.participation_status
          )
          order by er.edition_number desc nulls last, er.edition_name desc
        )
        from entry_rows er
      ), '[]'::jsonb)
    )
  end
  from country_row c
  right join (select 1) singleton on true;
$$;

revoke all on function public.v3_public_country_profile(text) from public;
grant execute on function public.v3_public_country_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

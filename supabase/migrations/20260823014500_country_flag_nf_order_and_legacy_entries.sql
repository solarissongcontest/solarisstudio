-- Country appearance: keep the flag as an independent optional layer so it can
-- be combined with a geometric/atmospheric decoration instead of competing
-- with that decoration for one setting.
alter table public.country_themes
  add column if not exists flag_enabled boolean not null default true;

-- Preserve the appearance of themes saved before flag_enabled existed.
update public.country_themes
set flag_enabled = decoration_style in ('auto', 'flag')
where flag_enabled is distinct from (decoration_style in ('auto', 'flag'));

-- "flag" is now represented by flag_enabled. Keep the old enum value accepted
-- for backwards compatibility, but normalize existing rows to no extra motif.
update public.country_themes
set decoration_style = 'none'
where decoration_style = 'flag';

-- The entry-reveal rollout correctly protects the current edition, but some
-- already-completed historical entries were later synchronized as draft. They
-- are archive data, not upcoming reveals. Publish only editions older than the
-- newest edition, and never touch scheduled rows.
with newest as (
  select max(edition_number) as edition_number
  from public.editions
)
update public.participants p
set publication_status = 'published',
    published_at = coalesce(p.published_at, p.updated_at, p.created_at, now()),
    publication_source = case
      when p.publication_source = 'confirmation' then 'confirmation'
      when p.publication_source = 'manual' then 'manual'
      else 'legacy'
    end,
    updated_at = now()
from public.editions e, newest n
where e.id = p.edition_id
  and e.edition_number < n.edition_number
  and p.publication_status = 'draft'
  and p.scheduled_publish_at is null
  and (nullif(trim(p.artist), '') is not null or nullif(trim(p.song), '') is not null);

-- Older Confirmations stored NF running order as 0..N-1. Convert those finals
-- as a unit so 0 becomes 1 without creating duplicate positions.
with zero_based_finals as (
  select distinct national_final_id
  from public.national_final_entries
  where position = 0
)
update public.national_final_entries nfe
set position = nfe.position + 1
from zero_based_finals z
where nfe.national_final_id = z.national_final_id
  and nfe.position is not null
  and nfe.position >= 0;

-- HODs and organizers can rank the full result of any NF attached to the
-- country, including finals that originated in Confirmations. Running order and
-- result order remain separate. If a winner is already stored it must remain
-- first, so reordering cannot silently replace the selected entry.
create or replace function public.set_country_national_final_result_order(
  _country_id uuid,
  _national_final_id uuid,
  _ordered_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_expected_count integer;
  v_unique_count integer;
  v_supplied_count integer;
begin
  if not public.can_manage_country_national_finals(_country_id) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  select * into v_country
  from public.countries
  where id = _country_id;

  if v_country.id is null then
    raise exception 'Country not found.' using errcode='22023';
  end if;

  select nf.* into v_nf
  from public.national_finals nf
  left join public.submissions s on s.id = nf.submission_id
  where nf.id = _national_final_id
    and (
      nf.country_id = _country_id
      or (
        nf.country_id is null
        and s.id is not null
        and lower(trim(s.country)) in (lower(trim(v_country.name)), lower(trim(v_country.short_code)))
      )
    );

  if v_nf.id is null then
    raise exception 'National final not found for this country.' using errcode='22023';
  end if;

  v_supplied_count := coalesce(cardinality(_ordered_entry_ids), 0);

  select count(*) into v_expected_count
  from public.national_final_entries nfe
  where nfe.national_final_id = v_nf.id
    and coalesce(nfe.removed, false) = false
    and nfe.review_status = 'accepted';

  if v_supplied_count <> v_expected_count then
    raise exception 'Result order must include every accepted entry exactly once.' using errcode='22023';
  end if;

  select count(distinct entry_id) into v_unique_count
  from unnest(coalesce(_ordered_entry_ids, array[]::uuid[])) as entry_id;

  if v_unique_count <> v_supplied_count then
    raise exception 'Result order contains the same entry more than once.' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_ordered_entry_ids, array[]::uuid[])) as supplied(entry_id)
    where not exists (
      select 1
      from public.national_final_entries nfe
      where nfe.id = supplied.entry_id
        and nfe.national_final_id = v_nf.id
        and coalesce(nfe.removed, false) = false
        and nfe.review_status = 'accepted'
    )
  ) then
    raise exception 'Result order contains an entry outside this national final.' using errcode='22023';
  end if;

  if v_nf.winning_entry_id is not null
     and v_supplied_count > 0
     and _ordered_entry_ids[1] is distinct from v_nf.winning_entry_id then
    raise exception 'The stored winner must stay in first place.' using errcode='22023';
  end if;

  update public.national_final_entries nfe
  set result_position = ordered.position::integer
  from unnest(_ordered_entry_ids) with ordinality as ordered(entry_id, position)
  where nfe.id = ordered.entry_id
    and nfe.national_final_id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'entry_count', v_supplied_count,
    'winning_entry_id', v_nf.winning_entry_id
  );
end;
$$;

revoke all on function public.set_country_national_final_result_order(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.set_country_national_final_result_order(uuid,uuid,uuid[]) to authenticated;
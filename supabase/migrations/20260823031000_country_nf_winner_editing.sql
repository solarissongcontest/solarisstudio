-- My Solaris can edit the winner separately from the National Final running
-- order/result order. Confirmation-imported finals keep their original UUIDs,
-- so the frontend can safely sync the same winner entry back to Confirmations.
create or replace function public.set_country_national_final_winner(
  _country_id uuid,
  _national_final_id uuid,
  _winning_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
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

  if _winning_entry_id is not null and not exists (
    select 1
    from public.national_final_entries nfe
    where nfe.id = _winning_entry_id
      and nfe.national_final_id = v_nf.id
      and coalesce(nfe.removed, false) = false
      and nfe.review_status = 'accepted'
  ) then
    raise exception 'Winner must be an accepted active entry from this national final.' using errcode='22023';
  end if;

  update public.national_finals
  set winning_entry_id = _winning_entry_id
  where id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'winning_entry_id', _winning_entry_id
  );
end;
$$;

revoke all on function public.set_country_national_final_winner(uuid,uuid,uuid) from public, anon;
grant execute on function public.set_country_national_final_winner(uuid,uuid,uuid) to authenticated;

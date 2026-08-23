begin;

-- Jury scorecharts have their own voter display rows. Keep those labels historically
-- accurate without ever changing voter country_id, contest_entity_id or HOD identity.
create or replace function public.preserve_historical_voter_display()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_country uuid;
  v_alias text;
  v_alias_flag text;
  v_current_flag text;
begin
  v_country := new.country_id;
  if v_country is null and new.contest_entity_id is not null then
    select ce.country_id into v_country
    from public.contest_entities ce
    where ce.id = new.contest_entity_id
      and ce.entity_type = 'global';
  end if;

  if v_country is null or new.edition_id is null then
    return new;
  end if;

  select cei.display_name, cei.flag_image, c.flag_image
    into v_alias, v_alias_flag, v_current_flag
  from public.country_edition_identities cei
  join public.countries c on c.id = cei.country_id
  where cei.country_id = v_country
    and cei.edition_id = new.edition_id;

  if found then
    new.name := v_alias;
    new.flag_image := coalesce(v_alias_flag, v_current_flag);
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_historical_voter_display() from public, anon, authenticated;

drop trigger if exists voters_preserve_historical_display on public.voters;
create trigger voters_preserve_historical_display
before insert or update of name, flag_image, country_id, contest_entity_id, edition_id
on public.voters
for each row execute function public.preserve_historical_voter_display();

create or replace function public.sync_historical_identity_voter_labels()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_country uuid := coalesce(new.country_id, old.country_id);
  v_edition uuid := coalesce(new.edition_id, old.edition_id);
  v_name text;
  v_flag text;
begin
  if tg_op = 'DELETE' then
    select c.name, c.flag_image into v_name, v_flag
    from public.countries c
    where c.id = v_country;
  else
    select new.display_name, coalesce(new.flag_image, c.flag_image)
      into v_name, v_flag
    from public.countries c
    where c.id = v_country;
  end if;

  update public.voters v
  set name = v_name,
      flag_image = v_flag
  where v.edition_id = v_edition
    and (
      v.country_id = v_country
      or exists (
        select 1
        from public.contest_entities ce
        where ce.id = v.contest_entity_id
          and ce.country_id = v_country
          and ce.entity_type = 'global'
      )
    );

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_historical_identity_voter_labels() from public, anon, authenticated;

drop trigger if exists country_edition_identities_sync_voters on public.country_edition_identities;
create trigger country_edition_identities_sync_voters
after insert or update or delete on public.country_edition_identities
for each row execute function public.sync_historical_identity_voter_labels();

comment on function public.preserve_historical_voter_display() is
  'Presentation-only historical jury voter label guard. Never alters canonical voter or HOD identity keys.';

commit;

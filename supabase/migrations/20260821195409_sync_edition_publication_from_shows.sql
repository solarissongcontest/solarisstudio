create or replace function public.sync_edition_publication_from_shows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
  end if;

  if v_old_edition is not null then
    update public.editions e
    set
      published = exists (
        select 1
        from public.shows s
        where s.edition_id = v_old_edition
          and s.published = true
      ),
      status = case
        when exists (
          select 1
          from public.shows s
          where s.edition_id = v_old_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) = 'draft' then 'active'
        when not exists (
          select 1
          from public.shows s
          where s.edition_id = v_old_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) not in ('complete', 'completed') then 'draft'
        else e.status
      end
    where e.id = v_old_edition;
  end if;

  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    update public.editions e
    set
      published = exists (
        select 1
        from public.shows s
        where s.edition_id = v_new_edition
          and s.published = true
      ),
      status = case
        when exists (
          select 1
          from public.shows s
          where s.edition_id = v_new_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) = 'draft' then 'active'
        when not exists (
          select 1
          from public.shows s
          where s.edition_id = v_new_edition
            and s.published = true
        ) and lower(coalesce(e.status, '')) not in ('complete', 'completed') then 'draft'
        else e.status
      end
    where e.id = v_new_edition;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_edition_publication_from_shows() from public;
revoke all on function public.sync_edition_publication_from_shows() from anon;
revoke all on function public.sync_edition_publication_from_shows() from authenticated;

drop trigger if exists shows_sync_edition_publication on public.shows;
create trigger shows_sync_edition_publication
after insert or delete or update of published, edition_id, publication_config
on public.shows
for each row
execute function public.sync_edition_publication_from_shows();

update public.editions e
set
  published = exists (
    select 1
    from public.shows s
    where s.edition_id = e.id
      and s.published = true
  ),
  status = case
    when exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
        and s.published = true
    ) and lower(coalesce(e.status, '')) = 'draft' then 'active'
    when not exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
        and s.published = true
    ) and lower(coalesce(e.status, '')) not in ('complete', 'completed') then 'draft'
    else e.status
  end;

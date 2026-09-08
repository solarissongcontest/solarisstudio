-- Televoting treats `is_active` as a single current-edition selector even
-- though canonical Solaris may keep several historical editions status='active'.
-- Enforce that invariant at the database layer so sync/import code cannot
-- recreate a multi-active state that breaks legacy single-row consumers.
create or replace function televoting.keep_single_active_edition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_active is true
     and (tg_op = 'INSERT' or old.is_active is distinct from true) then
    update televoting.editions
    set is_active = false,
        updated_at = now()
    where id <> new.id
      and is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists keep_single_active_edition on televoting.editions;
create trigger keep_single_active_edition
before insert or update of is_active on televoting.editions
for each row
execute function televoting.keep_single_active_edition();

create unique index if not exists televoting_editions_single_active_idx
  on televoting.editions ((is_active))
  where is_active = true;

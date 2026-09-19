create or replace function private.guard_result_publication_requires_reveal_ready()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old_results_public boolean := false;
  v_new_results_public boolean := false;
  v_ops public.studio2_result_operations%rowtype;
begin
  if tg_op = 'UPDATE' then
    v_old_results_public :=
      coalesce(old.published, false)
      and (
        coalesce((old.publication_config ->> 'results')::boolean, false)
        or coalesce((old.publication_config ->> 'jury_results')::boolean, false)
        or coalesce((old.publication_config ->> 'televote_results')::boolean, false)
        or coalesce((old.publication_config ->> 'detailed_voting')::boolean, false)
      );
  end if;

  v_new_results_public :=
    coalesce(new.published, false)
    and (
      coalesce((new.publication_config ->> 'results')::boolean, false)
      or coalesce((new.publication_config ->> 'jury_results')::boolean, false)
      or coalesce((new.publication_config ->> 'televote_results')::boolean, false)
      or coalesce((new.publication_config ->> 'detailed_voting')::boolean, false)
    );

  if v_new_results_public and not v_old_results_public then
    select *
      into v_ops
      from public.studio2_result_operations
      where show_id = new.id;

    if not found
       or v_ops.calculation_version <= 0
       or v_ops.reviewed_version is distinct from v_ops.calculation_version
       or v_ops.locked_version is distinct from v_ops.calculation_version
       or v_ops.reveal_ready_version is distinct from v_ops.calculation_version then
      raise exception
        'Results cannot be published until the current calculation is reviewed, locked and marked reveal ready.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_result_publication_requires_reveal_ready()
from public, anon, authenticated;

drop trigger if exists guard_result_publication_requires_reveal_ready on public.shows;
create trigger guard_result_publication_requires_reveal_ready
before insert or update of published, publication_config
on public.shows
for each row
execute function private.guard_result_publication_requires_reveal_ready();

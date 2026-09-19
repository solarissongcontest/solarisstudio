create or replace function private.guard_result_publication_requires_reveal_ready()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_new_outcome_exposure boolean := false;
  v_ops public.studio2_result_operations%rowtype;
begin
  if coalesce(new.published, false) then
    v_new_outcome_exposure :=
      (
        coalesce((new.publication_config ->> 'qualifiers')::boolean, false)
        and (
          tg_op = 'INSERT'
          or not coalesce(old.published, false)
          or not coalesce((old.publication_config ->> 'qualifiers')::boolean, false)
        )
      )
      or (
        coalesce((new.publication_config ->> 'results')::boolean, false)
        and (
          tg_op = 'INSERT'
          or not coalesce(old.published, false)
          or not coalesce((old.publication_config ->> 'results')::boolean, false)
        )
      )
      or (
        coalesce((new.publication_config ->> 'jury_results')::boolean, false)
        and (
          tg_op = 'INSERT'
          or not coalesce(old.published, false)
          or not coalesce((old.publication_config ->> 'jury_results')::boolean, false)
        )
      )
      or (
        coalesce((new.publication_config ->> 'televote_results')::boolean, false)
        and (
          tg_op = 'INSERT'
          or not coalesce(old.published, false)
          or not coalesce((old.publication_config ->> 'televote_results')::boolean, false)
        )
      )
      or (
        coalesce((new.publication_config ->> 'detailed_voting')::boolean, false)
        and (
          tg_op = 'INSERT'
          or not coalesce(old.published, false)
          or not coalesce((old.publication_config ->> 'detailed_voting')::boolean, false)
        )
      );
  end if;

  if v_new_outcome_exposure then
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
        'Qualification and result outcomes cannot be published until the current calculation is reviewed, locked and marked reveal ready.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_result_publication_requires_reveal_ready()
from public, anon, authenticated;

notify pgrst, 'reload schema';

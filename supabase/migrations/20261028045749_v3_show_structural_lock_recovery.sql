begin;
select public.v3_register_migration_contract(
  'v3.show.structural-lock-recovery', 1, 'forward_fix_only', false, null,
  'Separate structural edit coordination from live cue authority. Preserve the single-live-cue invariant and require the canonical in-flight operation before any rundown change; authorized operators can recover an abandoned structural lock while live.'
);
create or replace function private.studio2_enforce_locked_rundown_live_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $guard$
declare
  v_rundown jsonb := new.broadcast_config -> 'studio2Rundown';
begin
  if v_rundown is not distinct from old.broadcast_config -> 'studio2Rundown' then
    return new;
  end if;
  if not private.v3_show_cue_operation_is_current(current_setting('app.v3_show_cue_operation_id', true)) then
    raise exception using errcode = '42501', message = 'SHOW_CUE_AUTHORITY';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(v_rundown -> 'segments', '[]'::jsonb)) items(segment)
      where segment ->> 'status' = 'live') > 1 then
    raise exception using errcode = '23514', message = 'Only one rundown segment may be live';
  end if;
  return new;
end
$guard$;
revoke all on function private.studio2_enforce_locked_rundown_live_state()
  from public, anon, authenticated, service_role;
commit;

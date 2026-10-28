begin;
do $catalog$
declare
  v_table text;
  v_role text;
begin
  foreach v_table in array array[
    'public.studio2_capability_grants', 'public.studio2_role_assignments',
    'public.studio2_role_capabilities', 'public.studio2_permission_subject_versions',
    'public.entries'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(v_role, v_table, 'TRUNCATE') then
        raise exception 'Unauthorized bulk authority: % may truncate %', v_role, v_table;
      end if;
    end loop;
  end loop;
end
$catalog$;
set local role service_role;
do $negative$
begin
  begin
    truncate public.studio2_permission_subject_versions;
    raise exception 'service_role bypassed canonical permission history';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.entries;
    raise exception 'service_role bypassed canonical Entry history';
  exception when insufficient_privilege then null;
  end;
end
$negative$;
rollback;

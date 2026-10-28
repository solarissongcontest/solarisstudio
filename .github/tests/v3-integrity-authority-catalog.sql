begin;

do $test$
declare
  v_role text;
  v_table text;
  v_fn record;
  v_required_functions text[] := array[
    'v3_public_create_anonymous_integrity_case',
    'v3_create_protected_integrity_case',
    'v3_reporter_reply_integrity_case',
    'v3_public_reply_anonymous_integrity_case',
    'studio2_integrity_case_transition',
    'studio2_integrity_assign_case_reviewer',
    'studio2_integrity_recuse_case_reviewer',
    'studio2_integrity_set_case_priority',
    'studio2_integrity_reply_case',
    'studio2_integrity_add_case_note',
    'studio2_integrity_record_preclearance_ruling',
    'studio2_integrity_record_finding',
    'studio2_integrity_record_sanction',
    'studio2_integrity_set_case_retention',
    'v3_submit_integrity_appeal',
    'v3_public_submit_anonymous_integrity_appeal',
    'studio2_integrity_assign_appeal_reviewer',
    'studio2_integrity_resolve_appeal',
    'studio2_integrity_grant_appeal_extension'
  ];
  v_internal_functions text[] := array[
    'public_create_anonymous_integrity_case_impl',
    'create_protected_integrity_case_impl',
    'v3_public_create_anonymous_integrity_case_impl',
    'v3_create_protected_integrity_case_impl',
    'reporter_submit_integrity_appeal_impl',
    'public_submit_anonymous_integrity_appeal_impl',
    'admin_set_integrity_priority_impl',
    'admin_reply_integrity_case_impl',
    'admin_record_integrity_finding_impl',
    'admin_record_integrity_sanction_impl'
  ];
begin
  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_appeals',
    'public.integrity_case_findings',
    'public.integrity_case_sanctions',
    'public.integrity_adjudication_history'
  ] loop
    if to_regclass(v_table) is null then
      raise exception 'Missing canonical Integrity table %', v_table;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = split_part(v_table, '.', 1)
        and c.relname = split_part(v_table, '.', 2)
    ) then
      raise exception 'RLS is disabled on canonical Integrity table %', v_table;
    end if;

    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(v_role, v_table, 'INSERT')
         or has_table_privilege(v_role, v_table, 'UPDATE')
         or has_table_privilege(v_role, v_table, 'DELETE')
         or has_table_privilege(v_role, v_table, 'TRUNCATE') then
        raise exception 'Direct DML remains for role % on %', v_role, v_table;
      end if;
    end loop;
  end loop;

  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role, 'public.integrity_case_events', 'INSERT')
       or has_table_privilege(v_role, 'public.integrity_case_events', 'UPDATE')
       or has_table_privilege(v_role, 'public.integrity_case_events', 'DELETE')
       or has_table_privilege(v_role, 'public.integrity_case_events', 'TRUNCATE') then
      raise exception 'Raw Integrity event DML remains for role %', v_role;
    end if;
  end loop;

  for v_fn in
    select p.oid,
           p.proname,
           p.prosecdef,
           p.proacl,
           coalesce(array_to_string(p.proconfig, ','), '') as proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(v_required_functions)
  loop
    if not v_fn.prosecdef then
      raise exception 'Canonical Integrity function % is not SECURITY DEFINER', v_fn.proname;
    end if;
    if position('search_path=' in lower(v_fn.proconfig)) = 0
       or position('pg_catalog' in lower(v_fn.proconfig)) = 0 then
      raise exception 'Canonical Integrity function % lacks a pinned pg_catalog search_path: %', v_fn.proname, v_fn.proconfig;
    end if;
    if exists (
      select 1
      from aclexplode(coalesce(v_fn.proacl, acldefault('f', (select proowner from pg_proc where oid = v_fn.oid)))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'Canonical Integrity function % remains executable by PUBLIC', v_fn.proname;
    end if;
  end loop;

  if (
    select count(distinct p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(v_required_functions)
  ) <> cardinality(v_required_functions) then
    raise exception 'One or more canonical Integrity commands are missing';
  end if;

  for v_fn in
    select p.oid, p.proname, p.proacl, p.proowner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(v_internal_functions)
  loop
    if exists (
      select 1
      from aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'Internal Integrity writer % remains executable by PUBLIC', v_fn.proname;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role, v_fn.oid, 'EXECUTE') then
        raise exception 'Internal Integrity writer % remains executable by %', v_fn.proname, v_role;
      end if;
    end loop;
  end loop;

  if (
    select count(distinct p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(v_internal_functions)
  ) <> cardinality(v_internal_functions) then
    raise exception 'One or more sanctioned Integrity internal writers are missing';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'integrity_cases'
      and t.tgname = 'v3_integrity_case_before_update' and not t.tgisinternal
  ) then raise exception 'Missing case lifecycle/version trigger'; end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'integrity_cases'
      and t.tgname = 'v3_integrity_case_changed_event' and not t.tgisinternal
  ) then raise exception 'Missing integrity.case_changed trigger'; end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'integrity_case_appeals'
      and t.tgname = 'v3_integrity_appeal_before_update' and not t.tgisinternal
  ) then raise exception 'Missing appeal lifecycle/version trigger'; end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'integrity_case_appeals'
      and t.tgname = 'v3_integrity_appeal_changed_event' and not t.tgisinternal
  ) then raise exception 'Missing integrity.appeal_changed trigger'; end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'integrity_adjudication_history'
      and t.tgname = 'v3_integrity_history_immutable' and not t.tgisinternal
  ) then raise exception 'Missing immutable Integrity history trigger'; end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'integrity_case_appeals'
      and indexname = 'integrity_case_appeals_one_participant_per_sanction_idx'
  ) then raise exception 'Missing participant appeal uniqueness invariant'; end if;
end
$test$;

rollback;

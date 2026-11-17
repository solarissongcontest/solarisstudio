begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- P04: the reviewed appeals in Organizer need the observed revision for
-- postgres-owned CAS commands. Preserve the full existing response shape.
do $preflight$ declare fn oid; begin
  fn := to_regprocedure('public.admin_integrity_case_resolution(uuid)');
  if fn is null or not exists (
    select 1 from pg_proc p where p.oid = fn
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and p.provolatile = 's'
      and pg_get_functiondef(p.oid) like '%public.integrity_is_organizer()%'
      and pg_get_functiondef(p.oid) like '%public.integrity_case_appeals%'
  ) then raise exception 'Unqualified Integrity appeal read authority' using errcode='55000'; end if;
  if not exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='integrity_case_appeals' and column_name='version')
  then raise exception 'Integrity appeal revision has not been installed' using errcode='55000'; end if;
  if has_function_privilege('anon',fn,'EXECUTE') or exists(
    select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acl_default('f',p.proowner))) acl
    where p.oid=fn and acl.grantee=0 and acl.privilege_type='EXECUTE')
  then raise exception 'Unexpected anonymous appeal resolution read access' using errcode='55000'; end if;
end $preflight$;

select public.v3_register_migration_contract(
  'v3.integrity.appeal-read-revision', 1, 'forward_fix_only', false, null,
  'Expose only existing appeal version in authorized Organizer readback for CAS-governed decisions'
);

create or replace function public.admin_integrity_case_resolution(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return jsonb_build_object(
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'finding_id', s.finding_id,
        'typical_level', s.typical_level,
        'final_level', s.final_level,
        'sanction_label', s.sanction_label,
        'target_type', s.target_type,
        'target_reference', s.target_reference,
        'aggravating_factors', s.aggravating_factors,
        'mitigating_factors', s.mitigating_factors,
        'rationale', s.rationale,
        'status', s.status,
        'supersedes_sanction_id', s.supersedes_sanction_id,
        'visible_to_reporter', s.visible_to_reporter,
        'effective_at', s.effective_at,
        'created_at', s.created_at
      ) order by s.created_at desc)
      from public.integrity_case_sanctions s where s.case_id = _case_id
    ), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'version', a.version,
        'sanction_id', a.sanction_id,
        'grounds', a.grounds,
        'submitted_via', a.submitted_via,
        'submitted_at', a.submitted_at,
        'deadline_at', a.deadline_at,
        'was_timely', a.was_timely,
        'status', a.status,
        'assigned_reviewer', a.assigned_reviewer,
        'decision_rationale', a.decision_rationale,
        'replacement_sanction_id', a.replacement_sanction_id,
        'extension_granted_at', a.extension_granted_at,
        'extension_reason', a.extension_reason,
        'decided_at', a.decided_at
      ) order by a.created_at desc)
      from public.integrity_case_appeals a where a.case_id = _case_id
    ), '[]'::jsonb)
  );
end;
$$;

-- CREATE OR REPLACE preserves existing explicit grants; reject any drift.
do $postflight$ declare fn oid; begin
 fn:=to_regprocedure('public.admin_integrity_case_resolution(uuid)');
 if fn is null or not has_function_privilege('authenticated',fn,'EXECUTE')
   or has_function_privilege('anon',fn,'EXECUTE')
   or not exists(select 1 from pg_proc p where p.oid=fn and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
     and p.proconfig @> array['search_path=pg_catalog, public, pg_temp']::text[]
     and pg_get_functiondef(p.oid) like '%' || chr(39) || 'version' || chr(39) || ', a.version%')
 then raise exception 'Appeal CAS readback authority or grants drift' using errcode='55000'; end if;
end $postflight$;
commit;

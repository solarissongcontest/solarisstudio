// Forward-only wrapper of the existing canonical CAS implementation. This is
// an artifact generator, never a hosted runner or migration-history repair.
import fs from "node:fs";
const expected = JSON.parse(
  fs.readFileSync(
    "docs/v3/recovery-candidates/evidence/results-operation-engine-source-postconditions.json",
    "utf8",
  ),
);
const source = fs.readFileSync(
  "supabase/migrations/20261104170500_v3_results_reviewed_input_cas.sql",
  "utf8",
);
if (!/^begin;\s/i.test(source) || !/commit;\s*$/i.test(source))
  throw Error("Canonical CAS transaction boundary changed");
const body = source.replace(/^begin;\s*/i, "").replace(/commit;\s*$/i, "");
console.log(`begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $pre$declare item jsonb;p record;begin
 if current_user<>'postgres' or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.results-operation-engine') then raise exception 'Reviewed CAS recovery requires ordered Results operation engine' using errcode='55000';end if;
 for item in select value from jsonb_array_elements('${JSON.stringify(expected).replaceAll("'", "''")}'::jsonb) loop
  select * into p from pg_proc where oid=to_regprocedure(item->>'identity');
  if p.oid is null or pg_get_userbyid(p.proowner) is distinct from item->>'owner' or p.prosecdef is distinct from (item->>'security_definer')::boolean or coalesce(to_jsonb(p.proconfig),'null'::jsonb) is distinct from item->'config' or array(select a::text from unnest(coalesce(p.proacl,acldefault('f',p.proowner)))a order by a::text) is distinct from array(select a::text from unnest(coalesce((item->>'acl')::aclitem[],acldefault('f',p.proowner)))a order by a::text) or encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') is distinct from item->>'sha256' then raise exception 'Reviewed CAS source prerequisite drift: %',item->>'identity' using errcode='55000';end if;
 end loop;
 if exists(select 1 from pg_attribute where attrelid='public.studio2_result_operations'::regclass and attname='review_basis_version' and not attisdropped)
 or exists(select 1 from pg_constraint where conrelid='public.studio2_result_operations'::regclass and conname='studio2_result_operations_review_basis_version_check')
 or exists(select 1 from pg_proc candidate_proc join pg_namespace n on n.oid=candidate_proc.pronamespace where
 (n.nspname='private' and candidate_proc.proname in('studio2_bump_result_review_basis','studio2_result_review_basis_row_changed','studio2_result_review_basis_show_changed'))
 or(n.nspname='public' and candidate_proc.proname in('studio2_result_operation_preview_v2','studio2_execute_result_operation_v2')))
 or exists(select 1 from pg_trigger where tgrelid in('public.participants'::regclass,'public.voters'::regclass,'public.jury_votes'::regclass,'public.jury_ballot_statuses'::regclass,'public.jury_ballot_submissions'::regclass,'public.televote_votes'::regclass,'public.results'::regclass,'public.shows'::regclass) and tgname in('studio2_results_review_basis_participants','studio2_results_review_basis_voters','studio2_results_review_basis_jury_votes','studio2_results_review_basis_jury_statuses','studio2_results_review_basis_jury_submissions','studio2_results_review_basis_televote_votes','studio2_results_review_basis_results','studio2_results_review_basis_shows'))
 or exists(select 1 from private.v3_migration_contracts where migration_key='v3.results.reviewed-input-cas') then
 raise exception 'Reviewed CAS recovery already or partially installed' using errcode='55000';end if;
 if to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)') is not null or exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.results-reviewed-cas') then raise exception 'Reviewed CAS recovery already or partially installed' using errcode='55000';end if;
 if to_regprocedure('private.studio2_result_preconditions_v3_base(uuid)') is null or to_regprocedure('public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint)') is null or to_regprocedure('auth.jwt()') is null then raise exception 'Reviewed CAS prerequisite missing' using errcode='55000';end if;
end $pre$;
select public.v3_register_migration_contract('v3.recovery.results-reviewed-cas',1,'forward_fix_only',false,null,'Adopt canonical reviewed-input CAS after recovered operation engine; retain immutable Results history');
${body}
commit;`);

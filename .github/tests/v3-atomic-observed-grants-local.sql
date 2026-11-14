\set ON_ERROR_STOP on
-- LOCAL fixture only: preserve exact hosted-observed service privileges.
-- Not a recommendation or production grant change. Approved frozen full ACL
-- digest: s06-hosted-catalog-digests-2026-11-10.json, these three identities.
begin;
do $pre$ begin
 if current_user<>'postgres' or (select count(*) from pg_class where oid in ('televoting.rounds'::regclass,'televoting.round_entries'::regclass,'televoting.round_results'::regclass) and pg_get_userbyid(relowner)='postgres' and relrowsecurity and md5(relacl::text)='f72a0894cb79dcf21cb97c7ecc2aa47c')<>3 then
  raise exception 'Local atomic grants require exact initial CRUD-only fixture; NEVER hosted' using errcode='55000';
 end if;
end $pre$;
grant truncate,references,trigger on table televoting.rounds,televoting.round_entries,televoting.round_results to service_role;
do $post$ begin
 if (select count(*) from pg_class where oid in ('televoting.rounds'::regclass,'televoting.round_entries'::regclass,'televoting.round_results'::regclass) and pg_get_userbyid(relowner)='postgres' and relrowsecurity and md5(relacl::text)='f150210c09473a4f8750ac0387061f65')<>3 then
  raise exception 'Local atomic grants do not match frozen hosted ACL';
 end if;
end $post$;
commit;

\set ON_ERROR_STOP on
-- Disposable local database only. Exercise the REAL immutable helper. Temporary
-- EXECUTE grants exist only in this rolled-back test transaction; never ship
-- a permissive replacement or change its production/frozen expected digest.
begin;
create function extensions.s02_expect_denied(statement text) returns void
language plpgsql security invoker set search_path=pg_catalog,public,private as $test$
declare observed text;
begin
 begin execute statement; exception when others then observed:=sqlstate; end;
 if observed is distinct from '42501' then
  raise exception 'S02 expected authorization denial, got %',coalesce(observed,'SUCCESS') using errcode='XX000';
 end if;
end
$test$;
do $assert$
begin
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
   where has_function_privilege(r,'private.studio2_require_strict_dual(text,uuid,text)','EXECUTE')) then
  raise exception 'Strict-dual helper unintentionally exposed to an API role';
 end if;
end $assert$;
grant usage on schema private,extensions to anon,authenticated;
grant execute on function private.studio2_require_strict_dual(text,uuid,text) to anon,authenticated;
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
set local request.jwt.claim.role='anon';
select extensions.s02_expect_denied($q$select private.studio2_require_strict_dual('edition.transition',null,'s02-denial')$q$);
reset role;
set local role authenticated;
set local request.jwt.claims='{"role":"authenticated"}';
set local request.jwt.claim.role='authenticated';
select extensions.s02_expect_denied($q$select private.studio2_require_strict_dual('edition.transition',null,'s02-denial')$q$);
set local request.jwt.claims='{"role":"authenticated","sub":"02000000-0000-4000-8000-000000000099"}';
select extensions.s02_expect_denied($q$select private.studio2_require_strict_dual('edition.transition','02000000-0000-4000-8000-000000000098','s02-denial')$q$);
reset role;
rollback;
select 'PASS S02 real strict-dual denies anonymous, missing actor and unauthorized actor; no helper/permission changes retained';

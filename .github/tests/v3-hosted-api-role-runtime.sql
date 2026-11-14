\set ON_ERROR_STOP on
begin;
-- RLS with no permissive policies: prove this is the actual privileged role,
-- while arbitrary source payload/context/provenance remain independently denied.
create table public.v3_api_role_rls_probe(id integer primary key);
insert into public.v3_api_role_rls_probe values(1);
alter table public.v3_api_role_rls_probe enable row level security;
grant select on public.v3_api_role_rls_probe to anon,authenticated,service_role;
do $check$ declare actor text; seen integer; begin
 foreach actor in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',actor);
  select count(*) into seen from public.v3_api_role_rls_probe;
  reset role;
  if seen<>case when actor='service_role' then 1 else 0 end then raise exception 'API role RLS behavior mismatch: %',actor; end if;
 end loop;
end $check$;
rollback;
select 'PASS: real service BYPASSRLS and ordinary API role RLS restriction';

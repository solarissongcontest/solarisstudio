\set ON_ERROR_STOP on
-- Only an isolated source-installed PostgreSQL 17 catalog proof. This is NOT
-- a raw Televote edition mutation authorization or an S16 allowlist.
begin;
do $schema_boundary$
declare
  v_public oid := 'public.editions'::regclass;
  v_televote oid := 'televoting.editions'::regclass;
  v_relation record;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or v_public is null or v_televote is null or v_public = v_televote then
    raise exception 'Televote and Solaris edition identities are not distinct local PG17 tables'
      using errcode='55000';
  end if;
  for v_relation in
    select c.oid, n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.oid in (v_public,v_televote)
  loop
    if v_relation.relkind <> 'r'
       or v_relation.relname <> 'editions'
       or v_relation.nspname not in ('public','televoting') then
      raise exception 'Unexpected edition relation identity %',v_relation.oid using errcode='55000';
    end if;
  end loop;
  raise notice 'PASS: real local PostgreSQL distinguishes public.editions and televoting.editions; explicit client schema changes no SQL grants';
end
$schema_boundary$;
rollback;

-- Solaris Studio emergency S16 security hardening, 19 November 2026.
-- Five critical official tables only; API-role TRUNCATE only. NOT the full S13-S16 release.
-- Fail-closed preflight, no DML, no RLS/trigger/function change, no public-write activation.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
declare
 targets constant text[]:=array['public.editions','public.shows','public.results','public.jury_votes','public.televote_votes'];
 actors constant text[]:=array['anon','authenticated','service_role'];
 before_acl text; after_acl text; n integer;
begin
 if current_user <> 'postgres' or current_setting('server_version_num') <> '170011' then
   raise exception 'S16 emergency: expected PostgreSQL 17.11 owner' using errcode='55000';
 end if;
 if (select count(*) from unnest(targets) t(name) where
      to_regclass(t.name) is null or
      (select c.relkind <> 'r' or not c.relrowsecurity or pg_get_userbyid(c.relowner) <> 'postgres'
       from pg_class c where c.oid=to_regclass(t.name))) <> 0 then
   raise exception 'S16 emergency: unqualified table/RLS/owner' using errcode='55000';
 end if;
 if exists (select 1 from unnest(actors) r(name)
   where not exists(select 1 from pg_roles where rolname=r.name)
   or pg_has_role(r.name,'postgres','USAGE')) then
   raise exception 'S16 emergency: unqualified role inheritance' using errcode='55000';
 end if;
 if exists (select 1 from unnest(targets) t(name) join pg_class c on c.oid=to_regclass(t.name)
   cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
   where x.grantee=0 and x.privilege_type='TRUNCATE') then
   raise exception 'S16 emergency: PUBLIC TRUNCATE unexpected' using errcode='55000';
 end if;
 if exists (select 1 from pg_trigger tr
   where (tr.tgtype & 32) <> 0
   and tr.tgrelid in (select to_regclass(t.name) from unnest(targets) t(name))) then
   raise exception 'S16 emergency: TRUNCATE trigger unexpected' using errcode='55000';
 end if;
 select count(*) into n from unnest(targets) t(name) cross join unnest(actors) r(name)
   where has_table_privilege(r.name,t.name,'TRUNCATE');
 if n <> 15 then
   raise exception 'S16 emergency: expected 15 TRUNCATE API grants, got %',n using errcode='55000';
 end if;
 select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s',
     t.name,r.name,
     has_table_privilege(r.name,t.name,'SELECT'),
     has_table_privilege(r.name,t.name,'INSERT'),
     has_table_privilege(r.name,t.name,'UPDATE'),
     has_table_privilege(r.name,t.name,'DELETE'),
     has_table_privilege(r.name,t.name,'REFERENCES,TRIGGER')
   ),chr(10) order by t.name,r.name)) into before_acl
   from unnest(targets) t(name) cross join unnest(actors) r(name);
 execute 'revoke truncate on table public.editions,public.shows,public.results,public.jury_votes,public.televote_votes from anon,authenticated,service_role';
 if exists (select 1 from unnest(targets) t(name) cross join unnest(actors) r(name)
    where has_table_privilege(r.name,t.name,'TRUNCATE'))
    or exists (select 1 from unnest(targets) t(name)
    where not has_table_privilege('postgres',t.name,'TRUNCATE')) then
   raise exception 'S16 emergency: effective API grants or owner authority wrong' using errcode='55000';
 end if;
 select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s',
     t.name,r.name,
     has_table_privilege(r.name,t.name,'SELECT'),
     has_table_privilege(r.name,t.name,'INSERT'),
     has_table_privilege(r.name,t.name,'UPDATE'),
     has_table_privilege(r.name,t.name,'DELETE'),
     has_table_privilege(r.name,t.name,'REFERENCES,TRIGGER')
   ),chr(10) order by t.name,r.name)) into after_acl
   from unnest(targets) t(name) cross join unnest(actors) r(name);
 if before_acl is distinct from after_acl then
   raise exception 'S16 emergency: unrelated effective table access changed' using errcode='55000';
 end if;
end $guard$;
commit;

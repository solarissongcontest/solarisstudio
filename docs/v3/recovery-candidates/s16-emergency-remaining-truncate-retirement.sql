-- Solaris Studio emergency closure of remaining RLS-independent TRUNCATE bypasses.
-- Single-transaction privilege-only patch. All fourteen launch relations must deny
-- anon/authenticated/service_role TRUNCATE after this operation.
-- This does NOT complete S13/S14 governance, normal DML retirement or release acceptance.
-- Hosted migration ledger intentionally NOT advanced by emergency privilege repair.
-- Future local-only S16 preflight must be requalified for pre-revoked Confirmation grants.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
declare
 targets constant text[]:=array['public.country_accounts','public.entries','public.edit_tokens','public.studio2_result_operations','public.studio2_show_publication_controls','public.studio2_upload_authorizations','public.submissions','televoting.televote_aggregations','televoting.vote_submissions'];
 all_targets constant text[]:=array['public.country_accounts','public.editions','public.entries','public.edit_tokens','public.jury_votes','public.results','public.shows','public.studio2_result_operations','public.studio2_show_publication_controls','public.studio2_upload_authorizations','public.submissions','public.televote_votes','televoting.televote_aggregations','televoting.vote_submissions'];
 broad_roles constant text[]:=array['public.country_accounts','public.entries','public.edit_tokens','public.submissions'];
 actors constant text[]:=array['anon','authenticated','service_role'];
 before_acl text; after_acl text; n integer;
begin
 if current_user <> 'postgres' or current_setting('server_version_num') <> '170011' then
   raise exception 'Remaining S16 TRUNCATE: expected PG17.11 postgres owner' using errcode='55000';
 end if;
 if (select count(*) from unnest(all_targets) t(name) where to_regclass(t.name) is null or
    (select c.relkind <> 'r' or not c.relrowsecurity or pg_get_userbyid(c.relowner) <> 'postgres'
     from pg_class c where c.oid=to_regclass(t.name))) <> 0 then
   raise exception 'Remaining S16 TRUNCATE: table identity, owner or RLS drift' using errcode='55000';
 end if;
 if exists (select 1 from unnest(actors) r(name) where
      not exists(select 1 from pg_roles where rolname=r.name) or
      pg_has_role(r.name,'postgres','USAGE')) then
   raise exception 'Remaining S16 TRUNCATE: API role inheritance drift' using errcode='55000';
 end if;
 if exists (select 1 from unnest(all_targets) t(name)
    join pg_class c on c.oid=to_regclass(t.name)
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    where x.grantee=0 and x.privilege_type='TRUNCATE') then
   raise exception 'Remaining S16 TRUNCATE: PUBLIC privilege remains' using errcode='55000';
 end if;
 if exists (select 1 from pg_trigger tr
     where (tr.tgtype & 32) <> 0 and tr.tgrelid in
     (select to_regclass(t.name) from unnest(all_targets) t(name))) then
   raise exception 'Remaining S16 TRUNCATE: unexpected trigger' using errcode='55000';
 end if;
 if exists (
   select 1 from unnest(all_targets) t(name) cross join unnest(actors) r(name)
   where has_table_privilege(r.name,t.name,'TRUNCATE') is distinct from
     (t.name=any(broad_roles) or
      (t.name=any(targets) and r.name='service_role'))
 ) then
   raise exception 'Remaining S16 TRUNCATE: current API privilege envelope differs from reviewed 17-grant state' using errcode='55000';
 end if;
 select count(*) into n from unnest(all_targets) t(name) cross join unnest(actors) r(name)
   where has_table_privilege(r.name,t.name,'TRUNCATE');
 if n <> 17 then raise exception 'Remaining S16 TRUNCATE: expected 17 remaining, found %',n using errcode='55000';end if;
 select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s',
   t.name,r.name,
   has_table_privilege(r.name,t.name,'SELECT'),
   has_table_privilege(r.name,t.name,'INSERT'),
   has_table_privilege(r.name,t.name,'UPDATE'),
   has_table_privilege(r.name,t.name,'DELETE'),
   has_table_privilege(r.name,t.name,'REFERENCES'),
   has_table_privilege(r.name,t.name,'TRIGGER'),
   has_table_privilege(r.name,t.name,'MAINTAIN')
 ),chr(10) order by t.name,r.name)) into before_acl
 from unnest(all_targets) t(name) cross join unnest(actors) r(name);

 execute 'revoke truncate on table public.country_accounts,public.entries,public.edit_tokens,public.studio2_result_operations,public.studio2_show_publication_controls,public.studio2_upload_authorizations,public.submissions,televoting.televote_aggregations,televoting.vote_submissions from anon,authenticated,service_role';

 if exists (select 1 from unnest(all_targets) t(name) cross join unnest(actors) r(name)
      where has_table_privilege(r.name,t.name,'TRUNCATE')) then
   raise exception 'Remaining S16 TRUNCATE: postcondition still grants API TRUNCATE' using errcode='42501';
 end if;
 if exists (select 1 from unnest(all_targets) t(name)
      where not has_table_privilege('postgres',t.name,'TRUNCATE')) then
   raise exception 'Remaining S16 TRUNCATE: canonical owner authority lost' using errcode='55000';
 end if;
 select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
   t.name,r.name,
   has_table_privilege(r.name,t.name,'SELECT'),
   has_table_privilege(r.name,t.name,'INSERT'),
   has_table_privilege(r.name,t.name,'UPDATE'),
   has_table_privilege(r.name,t.name,'DELETE'),
   has_table_privilege(r.name,t.name,'REFERENCES'),
   has_table_privilege(r.name,t.name,'TRIGGER'),
   has_table_privilege(r.name,t.name,'MAINTAIN')
 ),chr(10) order by t.name,r.name)) into after_acl
 from unnest(all_targets) t(name) cross join unnest(actors) r(name);
 if after_acl is distinct from before_acl then
   raise exception 'Remaining S16 TRUNCATE: non-TRUNCATE effective permission changed' using errcode='55000';
 end if;
end $guard$;
commit;

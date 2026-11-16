\set ON_ERROR_STOP on
-- Separate owner-only production candidate. No production authorization.
-- Execute only after exact-artifact approval and verified recovery prerequisites.
-- It intentionally cannot be run by production postgres: that role does not
-- own these provider objects and cannot SET ROLE supabase_storage_admin.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $pre$
declare item record;checked_policy pg_policy%rowtype;other_digest text;
begin
 if current_user<>'supabase_storage_admin' or not exists(select 1 from pg_class where oid=to_regclass('storage.objects') and pg_get_userbyid(relowner)='supabase_storage_admin' and relrowsecurity)then
  raise exception 'Media Storage cutover requires the actual Storage table owner' using errcode='42501';end if;
 for item in select * from(values
  ('country media bucket owner delete','38b9d3ca0746f80b33cc05b42bc67aee'),
  ('country fonts owner delete','bafa27d70dfeb33101d0bad493dd2a6d'),
  ('organizers delete edition artwork','87de0ce1479ea4ed867619a7e3e1233d'))v(name,digest)loop
  select * into checked_policy from pg_policy where polrelid='storage.objects'::regclass and polname=item.name;
  if checked_policy.oid is null or checked_policy.polcmd<>'d' or not checked_policy.polpermissive or
     md5(coalesce(pg_get_expr(checked_policy.polqual,checked_policy.polrelid),''))<>item.digest or
     pg_get_expr(checked_policy.polwithcheck,checked_policy.polrelid) is not null or
     array(select pg_get_userbyid(r)::text from unnest(checked_policy.polroles)r) is distinct from array['authenticated']then
   raise exception 'Media Storage policy drift or already-applied cutover: %',item.name using errcode='55000';end if;
 end loop;
 if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname in('country media owner delete','country font owner delete','edition artwork organizer delete'))then
  raise exception 'Unqualified alternative Storage deletion policy' using errcode='55000';end if;
 select md5(coalesce(string_agg(row(p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text,'|'order by p.polname),''))into other_digest from pg_policy p where polrelid='storage.objects'::regclass and polname not in('country media bucket owner delete','country fonts owner delete','organizers delete edition artwork');
 perform set_config('solaris.media.other_policy_digest',other_digest,true);
end $pre$;
drop policy "country media bucket owner delete" on storage.objects;
drop policy "country fonts owner delete" on storage.objects;
drop policy "organizers delete edition artwork" on storage.objects;
do $post$ declare other_digest text;begin
 select md5(coalesce(string_agg(row(p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text,'|'order by p.polname),''))into other_digest from pg_policy p where polrelid='storage.objects'::regclass;
 if other_digest is distinct from current_setting('solaris.media.other_policy_digest') or not(select relrowsecurity from pg_class where oid='storage.objects'::regclass)then
  raise exception 'Unrelated Storage policy or RLS changed' using errcode='55000';end if;
end $post$;
notify pgrst,'reload schema';
commit;

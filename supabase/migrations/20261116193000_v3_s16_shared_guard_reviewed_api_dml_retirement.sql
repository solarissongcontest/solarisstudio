-- S16 phase 9: close real API-role mutation privileges at a verified
-- shared-platform-guard subset. This is NOT a blanket trigger allowlist.
-- Remaining country, editions, entries, shows and round-bindings direct writers need
-- their own canonical command cutovers before their grants can be retired.
-- Source-only forward migration; never apply to hosted without owner approval.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $guard_acl_preflight$
declare
  v_table text;
  v_rel pg_class%rowtype;
  v_guard oid := to_regprocedure('private.studio2_guard_direct_client_write()');
  v_command text;
  v_fn pg_proc%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or v_guard is null
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
  then
    raise exception 'S16 shared-guard DML cutover requires exact PG17 source owner and governed registry'
      using errcode='55000';
  end if;
  if exists (select 1 from private.v3_migration_contracts
             where migration_key='v3.s16.shared-guard-reviewed-api-dml-cutover') then
    raise exception 'S16 shared-guard reviewed DML cutover already installed'
      using errcode='55000';
  end if;

  foreach v_table in array array[
    'public.results',
    'public.televote_votes'
  ] loop
    select * into v_rel from pg_class where oid=to_regclass(v_table);
    if v_rel.oid is null or v_rel.relkind<>'r'
       or pg_get_userbyid(v_rel.relowner)<>'postgres'
       or not v_rel.relrowsecurity
       or exists (select 1 from pg_attribute a
                  where a.attrelid=v_rel.oid and a.attnum>0
                    and not a.attisdropped and a.attacl is not null)
       or not exists (
         select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
         where t.tgrelid=v_rel.oid
           and t.tgname='studio2_platform_direct_write_guard'
           and t.tgenabled='O' and not t.tgisinternal
           and t.tgtype=30 -- BEFORE statement INSERT/UPDATE/DELETE
           and t.tgfoid=v_guard
           and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
           and p.proconfig=array['search_path=pg_catalog, public, private']::text[]
       )
    then
      raise exception 'S16 shared-guard attachment, RLS or table ACL drift: %',v_table
        using errcode='55000';
    end if;
    if not has_table_privilege('service_role',v_table,'SELECT') then
      raise exception 'S16 cannot retire DML without preserving service read: %',v_table
        using errcode='55000';
    end if;
  end loop;

  foreach v_command in array array[
    'public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)',
    'public.v3_reconcile_published_televote(text,uuid)'
  ] loop
    select * into v_fn from pg_proc where oid=to_regprocedure(v_command);
    if v_fn.oid is null or not v_fn.prosecdef
       or pg_get_userbyid(v_fn.proowner)<>'postgres'
       or v_fn.proconfig is distinct from
          (case v_command
             when 'public.v3_reconcile_published_televote(text,uuid)'
              then array['search_path=pg_catalog, public, private, televoting, extensions']::text[]
            else array['search_path=pg_catalog, public, private']::text[]
          end)
       or has_function_privilege('anon',v_fn.oid,'EXECUTE')
    then
      raise exception 'S16 canonical owner command or privilege drift: %',v_command
        using errcode='55000';
    end if;
  end loop;
  if not has_function_privilege('authenticated',
       'public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.v3_reconcile_published_televote(text,uuid)','EXECUTE')
  then
    raise exception 'S16 canonical command EXECUTE cutover prerequisite missing'
      using errcode='55000';
  end if;
end
$guard_acl_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.shared-guard-reviewed-api-dml-cutover',1,'forward_fix_only',false,null,
  'Retire direct API DML for frozen Results owner and Televote projection without altering their canonical owner-executed commands'
);

-- The recovered S02 country-claim RPC differs from the exact source catalog.
-- Country ownership remains a separate FAIL-CLOSED dependency; no fabricated
-- fixture equivalence or unsafe privilege revoke is permitted here.
-- Do not revoke SELECT or the EXECUTE privileges of canonical SECURITY DEFINER
-- commands. An API-role grant is not a substitute for an operation receipt.
revoke insert,update,delete,truncate,references,trigger,maintain on table
  public.results,
  public.televote_votes
from public,anon,authenticated,service_role;

do $guard_acl_postcheck$
declare v_table text; v_role text; v_priv text;
begin
  foreach v_table in array array[
    'public.results','public.televote_votes'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_priv in array array[
        'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
      ] loop
        if has_table_privilege(v_role,v_table,v_priv) then
          raise exception 'S16 direct API role privilege survived: % % %',
            v_role,v_table,v_priv using errcode='42501';
        end if;
      end loop;
      if has_any_column_privilege(v_role,v_table,'INSERT,UPDATE') then
        raise exception 'S16 column-level API mutation grant survived: % %',
          v_role,v_table using errcode='42501';
      end if;
    end loop;
    if not has_table_privilege('service_role',v_table,'SELECT') then
      raise exception 'S16 canonical service read regressed: %',v_table using errcode='55000';
    end if;
  end loop;
end
$guard_acl_postcheck$;

notify pgrst,'reload schema';
commit;

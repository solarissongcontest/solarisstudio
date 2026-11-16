begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Preserve the existing actor-scoped Jury commands. API table/column grants,
-- especially RLS-independent TRUNCATE, are not a governed submission authority.
do $pre$
declare item jsonb;routine record;relation record;actor text;
begin
 if current_user<>'postgres' or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.jury.governed-submission-cutover') then raise exception 'Jury table cutover requires prior governed submission retirement' using errcode='55000';end if;
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.jury.canonical-table-authority') then raise exception 'Jury table cutover already installed' using errcode='55000';end if;
 if encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('public.submit_country_jury_ballot(uuid,jsonb,uuid)')),'UTF8')),'hex') is distinct from '4578fe9555892e48ebd655ccdafecf822882bb26e3f8bfe8a6743a91897f1149' then raise exception 'Jury internal delegate drift' using errcode='55000';end if;
 foreach actor in array array['anon','authenticated','service_role']loop
  if has_function_privilege(actor,to_regprocedure('public.submit_country_jury_ballot(uuid,jsonb,uuid)'),'EXECUTE') then raise exception 'Legacy Jury API writer remains' using errcode='42501';end if;
 end loop;
 for item in select value from jsonb_array_elements('[
  {
    "identity": "public.v3_jury_receipt(uuid)",
    "owner": "postgres",
    "securityDefiner": true,
    "config": [
      "search_path=pg_catalog, public, private"
    ],
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "sha256": "5547a07d1966172e35d1705f5e04273e93c2712c15f297a58fe01c0bfd615198"
  },
  {
    "identity": "public.v3_load_jury_draft(uuid)",
    "owner": "postgres",
    "securityDefiner": true,
    "config": [
      "search_path=pg_catalog, public, private"
    ],
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "sha256": "5505616e298d1ab6349aa4ead5a86438cd6838b31b00784c7d519b2bf53be9ca"
  },
  {
    "identity": "public.v3_reconcile_jury_submission(uuid)",
    "owner": "postgres",
    "securityDefiner": true,
    "config": [
      "search_path=pg_catalog, public, private"
    ],
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "sha256": "d1eda0e31ed7204abd8ea71e3aaef02e3d1511da9d77288ec19f5845fb2ba633"
  },
  {
    "identity": "public.v3_save_jury_draft(uuid,jsonb,bigint,text,text)",
    "owner": "postgres",
    "securityDefiner": true,
    "config": [
      "search_path=pg_catalog, public, private"
    ],
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "sha256": "350e970e56ad1027c31e8667435a9b00625e9f9f154676a658015622f41f3b2a"
  },
  {
    "identity": "public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)",
    "owner": "postgres",
    "securityDefiner": true,
    "config": [
      "search_path=pg_catalog, public, private, televoting, extensions"
    ],
    "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
    "sha256": "0abd0a2edf61f54fed2b1db22fde200b2c965be1c0b3b1b817837daa5c0384aa"
  }
]'::jsonb)loop
  select * into routine from pg_proc where oid=to_regprocedure(item->>'identity');
  if routine.oid is null or pg_get_userbyid(routine.proowner) is distinct from item->>'owner'
   or routine.prosecdef is distinct from (item->>'securityDefiner')::boolean
   or coalesce(to_jsonb(routine.proconfig),'null'::jsonb) is distinct from item->'config'
   or encode(sha256(convert_to(pg_get_functiondef(routine.oid),'UTF8')),'hex') is distinct from item->>'sha256'
   or array(select a::text from unnest(coalesce(routine.proacl,acldefault('f',routine.proowner)))a order by a::text) is distinct from array(select a::text from unnest((item->>'acl')::aclitem[])a order by a::text) then
    raise exception 'Governed Jury routine authority drift: %',item->>'identity' using errcode='55000';end if;
 end loop;
 for item in select value from jsonb_array_elements('[
  {
    "identity": "private.v3_jury_drafts",
    "owner": "postgres",
    "rls": false,
    "forceRls": false
  },
  {
    "identity": "private.v3_jury_operations",
    "owner": "postgres",
    "rls": false,
    "forceRls": false
  },
  {
    "identity": "public.jury_ballot_statuses",
    "owner": "postgres",
    "rls": true,
    "forceRls": false
  },
  {
    "identity": "public.jury_ballot_submissions",
    "owner": "postgres",
    "rls": true,
    "forceRls": false
  },
  {
    "identity": "public.jury_votes",
    "owner": "postgres",
    "rls": true,
    "forceRls": false
  },
  {
    "identity": "public.jury_voting_windows",
    "owner": "postgres",
    "rls": true,
    "forceRls": false
  },
  {
    "identity": "public.studio2_jury_window_versions",
    "owner": "postgres",
    "rls": true,
    "forceRls": false
  }
]'::jsonb)loop
  select * into relation from pg_class where oid=to_regclass(item->>'identity');
  if relation.oid is null or pg_get_userbyid(relation.relowner) is distinct from item->>'owner'
   or relation.relrowsecurity is distinct from (item->>'rls')::boolean or relation.relforcerowsecurity is distinct from (item->>'forceRls')::boolean then
    raise exception 'Jury table ownership/RLS drift: %',item->>'identity' using errcode='55000';end if;
 end loop;
end $pre$;
select public.v3_register_migration_contract('v3.jury.canonical-table-authority',1,'forward_fix_only',false,null,'Close direct Jury API table/column DML and TRUNCATE; retain governed ballots/drafts/receipts/window commands and existing reads');
do $cutover$
declare identity text;columns text;actor text;before_reads jsonb;after_reads jsonb;
begin
 foreach identity in array array['private.v3_jury_drafts','private.v3_jury_operations','public.jury_ballot_statuses','public.jury_ballot_submissions','public.jury_votes','public.jury_voting_windows','public.studio2_jury_window_versions']loop
  select jsonb_object_agg(r,has_table_privilege(r,identity,'SELECT'))into before_reads from unnest(array['anon','authenticated','service_role'])r;
  execute format('revoke insert,update,delete,truncate,references,trigger,maintain on table %s from public,anon,authenticated,service_role',identity);
  select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid=to_regclass(identity) and attnum>0 and not attisdropped;
  execute format('revoke insert(%1$s),update(%1$s),references(%1$s) on table %2$s from public,anon,authenticated,service_role',columns,identity);
  foreach actor in array array['anon','authenticated','service_role']loop
   if has_table_privilege(actor,identity,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(actor,identity,'INSERT,UPDATE,REFERENCES') then
    raise exception 'Inherited direct Jury mutation authority remains: % %',actor,identity using errcode='42501';end if;
  end loop;
  select jsonb_object_agg(r,has_table_privilege(r,identity,'SELECT'))into after_reads from unnest(array['anon','authenticated','service_role'])r;
  if before_reads is distinct from after_reads then raise exception 'Jury read grants changed';end if;
 end loop;
end $cutover$;
notify pgrst,'reload schema';
commit;


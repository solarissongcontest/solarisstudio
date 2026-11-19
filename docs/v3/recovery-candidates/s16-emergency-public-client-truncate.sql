-- Solaris Studio emergency prevention of anonymous/authenticated TRUNCATE on legacy PUBLIC tables.
-- Live provenance: 19 Nov 2026 project dkxmnvekiopyesuzggeu, PostgreSQL 17.11.
-- Target 55 explicit postgres-owned RLS-enabled PUBLIC tables; 52 anon and 55 auth grants.
-- No row mutations. No service_role, postgres owner, table-level DML, column grants or default ACL change.
-- IMPORTANT: Supabase default table privileges still grant TRUNCATE on NEW public tables
-- for postgres and supabase_admin owners. Those require separately authorized privilege-owner
-- repairs, especially supabase_admin (not inherited by connected postgres). Never claim future-proofing.
begin;
set local lock_timeout='3s';
set local statement_timeout='40s';
do $hardening$
declare
  v_names constant text[] := array['admin_deadlines','admin_preferences','app_push_subscriptions','content_events','contest_entities','countries','country_design_presets','country_edition_identities','country_font_assets','country_hod_edition_claims','country_media','country_profile_sections','country_profiles','country_themes','delegation_hod_assignments','delegation_people','fan_event_reads','fan_follows','fan_profiles','fan_taste_ballots','fantasy_game_entries','fantasy_games','fantasy_team_entries','fantasy_teams','friend_voting_settings','integration_events','integration_links','internal_entries','jury_ballot_statuses','jury_ballot_submissions','jury_voting_windows','national_final_entries','national_finals','next_in_line_responses','next_in_line_submissions','notification_deliveries','notification_preferences','participants','prediction_consensus_snapshots','prediction_entries','prediction_entry_versions','prediction_items','prediction_rounds','prediction_scores','public_televote_country_contributions','round_stats','submission_browser_sessions','submission_drafts','submission_ip_history','submission_review_history','submission_rounds','televoting_round_bindings','themes','user_roles','voters'];
  v_actual text[];
  v_role text;
  v_table text;
  v_before text;
  v_after text;
  v_before_service integer;
  v_after_service integer;
begin
  if current_user <> 'postgres' or current_setting('server_version_num') <> '170011' then
    raise exception 'PUBLIC TRUNCATE hardening: expected PostgreSQL 17.11 postgres session' using errcode='55000';
  end if;
  if (select count(*) from unnest(v_names)) <> 55
     or (select count(distinct name) from unnest(v_names) as x(name)) <> 55 then
    raise exception 'PUBLIC TRUNCATE hardening: static manifest invalid' using errcode='55000';
  end if;
  select array_agg(c.relname order by c.relname) into v_actual
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and (has_table_privilege('anon',c.oid,'TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'TRUNCATE'));
  if v_actual is distinct from array(select unnest(v_names) order by 1) then
    raise exception 'PUBLIC TRUNCATE hardening: actual 55-table set differs from manifest' using errcode='55000';
  end if;
  if (select count(*) from unnest(v_names) t(name)
      join pg_class c on c.oid=to_regclass(format('%I.%I','public',t.name))
      where c.relkind='r' and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres') <> 55 then
    raise exception 'PUBLIC TRUNCATE hardening: RLS, table type or owner drift' using errcode='55000';
  end if;
  if exists(select 1 from unnest(v_names) t(name)
     join pg_class c on c.oid=to_regclass(format('%I.%I','public',t.name))
     cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
     where x.grantee=0 and x.privilege_type='TRUNCATE') then
    raise exception 'PUBLIC TRUNCATE hardening: unreviewed PUBLIC grant' using errcode='55000';
  end if;
  if exists(select 1 from pg_trigger tr where tr.tgtype & 32 <> 0
     and tr.tgrelid IN (select to_regclass(format('%I.%I','public',t.name)) from unnest(v_names) t(name))) then
    raise exception 'PUBLIC TRUNCATE hardening: unreviewed truncate trigger' using errcode='55000';
  end if;
  if (select count(*) from unnest(v_names) t(name) where has_table_privilege('anon',format('%I.%I','public',t.name),'TRUNCATE')) <> 52
    or (select count(*) from unnest(v_names) t(name) where has_table_privilege('authenticated',format('%I.%I','public',t.name),'TRUNCATE')) <> 55 then
    raise exception 'PUBLIC TRUNCATE hardening: API role grant-count drift' using errcode='55000';
  end if;
  select md5(string_agg(concat_ws('|', c.oid::text, r.role_name,
    has_table_privilege(r.role_name,c.oid,'SELECT'),
    has_table_privilege(r.role_name,c.oid,'INSERT'),
    has_table_privilege(r.role_name,c.oid,'UPDATE'),
    has_table_privilege(r.role_name,c.oid,'DELETE'),
    has_table_privilege(r.role_name,c.oid,'REFERENCES'),
    has_table_privilege(r.role_name,c.oid,'TRIGGER'),
    has_table_privilege(r.role_name,c.oid,'MAINTAIN'),
    has_any_column_privilege(r.role_name,c.oid,'INSERT,UPDATE,REFERENCES')
    ),chr(10) order by c.oid,r.role_name)) into v_before
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
   where n.nspname='public' and c.relkind='r';
  select count(*) into v_before_service from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and has_table_privilege('service_role',c.oid,'TRUNCATE');
  execute format('revoke truncate on table %s from anon, authenticated',
    (select string_agg(format('%I.%I','public',name),',' order by name) from unnest(v_names) x(name)));
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'
        and (has_table_privilege('anon',c.oid,'TRUNCATE')
          or has_table_privilege('authenticated',c.oid,'TRUNCATE'))) then
    raise exception 'PUBLIC TRUNCATE hardening: remaining client truncate privilege' using errcode='42501';
  end if;
  select md5(string_agg(concat_ws('|', c.oid::text, r.role_name,
    has_table_privilege(r.role_name,c.oid,'SELECT'),
    has_table_privilege(r.role_name,c.oid,'INSERT'),
    has_table_privilege(r.role_name,c.oid,'UPDATE'),
    has_table_privilege(r.role_name,c.oid,'DELETE'),
    has_table_privilege(r.role_name,c.oid,'REFERENCES'),
    has_table_privilege(r.role_name,c.oid,'TRIGGER'),
    has_table_privilege(r.role_name,c.oid,'MAINTAIN'),
    has_any_column_privilege(r.role_name,c.oid,'INSERT,UPDATE,REFERENCES')
    ),chr(10) order by c.oid,r.role_name)) into v_after
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
   where n.nspname='public' and c.relkind='r';
  select count(*) into v_after_service from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and has_table_privilege('service_role',c.oid,'TRUNCATE');
  if v_after is distinct from v_before or v_after_service <> v_before_service then
    raise exception 'PUBLIC TRUNCATE hardening: unrelated or service authority changed' using errcode='55000';
  end if;
end $hardening$;
commit;

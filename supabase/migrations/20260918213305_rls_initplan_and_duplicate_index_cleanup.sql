begin;

-- Optimize the remaining RLS auth-function calls flagged by Supabase.
-- Preserve each policy's roles, command and boolean logic; only wrap auth.uid()
-- in a scalar SELECT so PostgreSQL evaluates it once per statement.

do $optimize$
declare
  v_target record;
  v_policy record;
  v_sql text;
begin
  for v_target in
    select *
    from (values
      ('public','user_roles','read own roles', true),
      ('public','country_accounts','country accounts read own', true),
      ('public','fan_taste_ballots','Fans can read own taste ballots', true),
      ('public','fan_taste_ballots','Fans can insert own taste ballots', true),
      ('public','fan_taste_ballots','Fans can update own taste ballots', true),
      ('public','fan_taste_ballots','Fans can delete own taste ballots', true),
      ('public','studio2_delegation_settings','studio2_delegation_settings_capability_read', true),
      ('public','studio2_jury_members','studio2_jury_members_capability_read', true),
      ('public','participants','participants unreleased owner or capability read', true),
      ('public','studio2_notice_receipts','studio2_notice_receipts_capability_read', true),
      ('public','admin_notifications','Organizers read own notifications', false),
      ('public','admin_notifications','Organizers update own notifications', false),
      ('public','admin_preferences','Organizers manage own admin preferences', false),
      ('public','themes','themes public read', true)
    ) as targets(schema_name, table_name, policy_name, required)
  loop
    select *
    into v_policy
    from pg_policies p
    where p.schemaname = v_target.schema_name
      and p.tablename = v_target.table_name
      and p.policyname = v_target.policy_name;

    if not found then
      if v_target.required then
        raise exception 'RLS optimization target missing: %.% / %',
          v_target.schema_name, v_target.table_name, v_target.policy_name;
      end if;
      continue;
    end if;

    v_sql := format(
      'alter policy %I on %I.%I',
      v_target.policy_name,
      v_target.schema_name,
      v_target.table_name
    );

    if v_policy.qual is not null then
      v_sql := v_sql || ' using (' ||
        replace(v_policy.qual, 'auth.uid()', '(select auth.uid())') || ')';
    end if;

    if v_policy.with_check is not null then
      v_sql := v_sql || ' with check (' ||
        replace(v_policy.with_check, 'auth.uid()', '(select auth.uid())') || ')';
    end if;

    execute v_sql;
  end loop;
end
$optimize$;

-- Production accumulated a second byte-for-byte equivalent btree(created_at desc)
-- index. Keep the name created by canonical repository history and remove only
-- the production-only duplicate.
drop index if exists public.admin_audit_created_idx;

do $verify$
declare
  v_target record;
  v_policy record;
begin
  for v_target in
    select *
    from (values
      ('public','user_roles','read own roles', true),
      ('public','country_accounts','country accounts read own', true),
      ('public','fan_taste_ballots','Fans can read own taste ballots', true),
      ('public','fan_taste_ballots','Fans can insert own taste ballots', true),
      ('public','fan_taste_ballots','Fans can update own taste ballots', true),
      ('public','fan_taste_ballots','Fans can delete own taste ballots', true),
      ('public','studio2_delegation_settings','studio2_delegation_settings_capability_read', true),
      ('public','studio2_jury_members','studio2_jury_members_capability_read', true),
      ('public','participants','participants unreleased owner or capability read', true),
      ('public','studio2_notice_receipts','studio2_notice_receipts_capability_read', true),
      ('public','admin_notifications','Organizers read own notifications', false),
      ('public','admin_notifications','Organizers update own notifications', false),
      ('public','admin_preferences','Organizers manage own admin preferences', false),
      ('public','themes','themes public read', true)
    ) as targets(schema_name, table_name, policy_name, required)
  loop
    select *
    into v_policy
    from pg_policies p
    where p.schemaname = v_target.schema_name
      and p.tablename = v_target.table_name
      and p.policyname = v_target.policy_name;

    if not found then
      if v_target.required then
        raise exception 'RLS optimization verification target missing: %.% / %',
          v_target.schema_name, v_target.table_name, v_target.policy_name;
      end if;
      continue;
    end if;

    if coalesce(v_policy.qual, '') not ilike '%select auth.uid()%'
       and coalesce(v_policy.with_check, '') not ilike '%select auth.uid()%' then
      raise exception 'RLS auth init-plan optimization did not persist: %.% / %',
        v_target.schema_name, v_target.table_name, v_target.policy_name;
    end if;
  end loop;

  if to_regclass('public.admin_audit_created_idx') is not null then
    raise exception 'Production-only duplicate admin audit created_at index still exists';
  end if;

  if to_regclass('public.admin_audit_log_created_at_idx') is null then
    raise exception 'Canonical repository admin audit created_at index is missing';
  end if;
end
$verify$;

commit;

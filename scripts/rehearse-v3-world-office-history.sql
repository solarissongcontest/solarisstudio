-- Execute only through scripts/rehearse-v3-world-office-history.sh against
-- a disposable local Supabase instance AFTER TG1/TG2 and TG3 migrations.
-- The whole rehearsal is transactional and intentionally rolls back.
\set ON_ERROR_STOP on
begin;

do $rehearse$
declare
  v_slug text := 'history-fixture-' || substr(md5(gen_random_uuid()::text), 1, 14);
  v_org_id uuid;
  v_office_id uuid;
  v_person_id uuid;
  v_country_id uuid;
  v_newest_id uuid;
  v_older_id uuid;
  v_page jsonb;
  v_next jsonb;
begin
  if to_regprocedure('public.world_public_office_history_v1(text,timestamptz,uuid,text,integer)') is null then
    raise exception 'TG3_HISTORY_RPC_NOT_INSTALLED';
  end if;

  if not exists (
    select 1 from public.studio2_feature_flags
    where key = 'terra_world_public'
      and enabled is false
      and admins_only is false
  ) or public.studio2_feature_enabled('terra_world_public', null) is distinct from false then
    raise exception 'TG3_WORLD_PUBLIC_DEFAULT_ROLLOUT_NOT_DISABLED';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'studio2_feature_flags'
      and constraint_row.conname = 'studio2_feature_flags_key_check'
      and pg_catalog.strpos(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      ), 'prediction_league') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_expr(
        constraint_row.conbin, constraint_row.conrelid
      ), 'terra_world_public') > 0
  ) then
    raise exception 'TG3_WORLD_PUBLIC_FLAG_ALLOWLIST_REPLACED_EXISTING_KEYS';
  end if;

  insert into public.world_organizations
    (slug, official_name, short_name, type, description, status, public_visibility)
  values
    (v_slug, 'Local History Rehearsal Organization', 'History Fixture',
      'international_union', 'Rollback-only public history test', 'active', 'public')
  returning id into v_org_id;

  insert into public.world_organization_offices
    (organization_id, slug, title, office_type, appointment_method, display_priority)
  values (v_org_id, 'chairperson', 'Historical Chairperson',
    'executive_leader', 'election', 10)
  returning id into v_office_id;

  insert into public.delegation_people (display_name, identity_key)
  values ('Original Officeholder', 'tg3-history-fixture:' || gen_random_uuid()::text)
  returning id into v_person_id;

  insert into public.countries (name, short_code)
  values ('Original Represented Country', 'X9Z')
  returning id into v_country_id;

  insert into public.world_office_terms
    (office_id, holder_person_id, represented_country_id, term_kind,
      status, started_at, actual_end_at, revision)
  values
    (v_office_id, v_person_id, v_country_id, 'full',
     'ended', timestamptz '2024-01-01 00:00:00+00',
     timestamptz '2024-12-31 00:00:00+00', 1)
  returning id into v_newest_id;

  insert into public.world_office_terms
    (office_id, holder_person_id, represented_country_id, term_kind,
      status, started_at, actual_end_at, revision)
  values
    (v_office_id, v_person_id, null, 'acting',
     'resigned', timestamptz '2023-01-01 00:00:00+00',
     timestamptz '2023-06-01 00:00:00+00', 2)
  returning id into v_older_id;

  -- A finished term's historical labels are not current profile labels.
  update public.delegation_people
     set display_name = 'Renamed Current Person'
   where id = v_person_id;
  update public.world_organization_offices
     set title = 'Renamed Current Office'
   where id = v_office_id;
  update public.countries
     set name = 'Renamed Current Country'
   where id = v_country_id;

  -- A concluded term cannot be reopened, have its historical country
  -- silently changed, or have its public labels forged through direct SQL.
  -- Validate the precise archive-integrity error, not an unrelated CHECK
  -- failure that happens to share the SQLSTATE.
  begin
    update public.world_office_terms
       set status = 'active', actual_end_at = null
     where id = v_newest_id;
    raise exception 'TG3_HISTORY_REOPEN_WAS_NOT_BLOCKED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'WORLD_CLOSED_OFFICE_TERM_IMMUTABLE' then
      raise exception 'TG3_HISTORY_REOPEN_FAILED_BY_UNEXPECTED_GUARD: %', sqlerrm;
    end if;
  end;

  begin
    update public.world_office_terms
       set represented_country_id = null
     where id = v_newest_id;
    raise exception 'TG3_HISTORY_COUNTRY_REWRITE_WAS_NOT_BLOCKED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'WORLD_CLOSED_OFFICE_TERM_IMMUTABLE' then
      raise exception 'TG3_HISTORY_COUNTRY_REWRITE_FAILED_BY_UNEXPECTED_GUARD: %', sqlerrm;
    end if;
  end;

  begin
    update public.world_office_terms
       set holder_user_id = gen_random_uuid()
     where id = v_newest_id;
    raise exception 'TG3_HISTORY_ACCOUNT_RELINK_WAS_NOT_BLOCKED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'WORLD_CLOSED_OFFICE_TERM_IMMUTABLE' then
      raise exception 'TG3_HISTORY_ACCOUNT_RELINK_FAILED_BY_UNEXPECTED_GUARD: %', sqlerrm;
    end if;
  end;

  update public.world_office_terms
     set holder_display_name_snapshot = 'FORGED HISTORICAL NAME',
         office_title_snapshot = 'FORGED OFFICE',
         represented_country_name_snapshot = 'FORGED COUNTRY'
   where id = v_newest_id;

  -- Nonconstitutional account/operational revision updates are still
  -- possible, but may not tamper with historical political records.
  update public.world_office_terms
     set holder_user_id = null, revision = 3
   where id = v_newest_id;

  v_page := public.world_public_office_history_v1(
    v_slug, null, null, null, 1);

  if v_page is null
     or v_page #>> '{terms,0,id}' <> v_newest_id::text
     or v_page #>> '{terms,0,holderDisplayName}' <> 'Original Officeholder'
     or v_page #>> '{terms,0,officeTitle}' <> 'Historical Chairperson'
     or v_page #>> '{terms,0,representedCountryName}' <> 'Original Represented Country'
     or v_page->>'hasMore' <> 'true'
     or v_page->'nextCursor' is null
     or v_page->>'officesTruncated' <> 'false' then
    raise exception 'TG3_HISTORY_FROZEN_LABELS_OR_FIRST_PAGE_FAILED: %', v_page;
  end if;

  v_next := v_page->'nextCursor';
  v_page := public.world_public_office_history_v1(
    v_slug,
    (v_next->>'startedAt')::timestamptz,
    (v_next->>'termId')::uuid,
    'chairperson',
    1
  );
  if v_page #>> '{terms,0,id}' <> v_older_id::text
     or v_page #>> '{terms,0,representedCountryName}' is not null
     or v_page->>'hasMore' <> 'false'
     or v_page->'nextCursor' <> 'null'::jsonb then
    raise exception 'TG3_HISTORY_KEYSET_OR_NULL_COUNTRY_FAILED: %', v_page;
  end if;

  v_page := public.world_public_office_history_v1(
    v_slug, null, null, 'nonexistent-office', 12);
  if jsonb_array_length(v_page->'terms') <> 0 then
    raise exception 'TG3_HISTORY_OFFICE_FILTER_FAILED';
  end if;

  -- Inaccessible private organizations must look like missing records.
  update public.world_organizations
     set public_visibility = 'private'
   where id = v_org_id;
  if public.world_public_office_history_v1(v_slug) is not null then
    raise exception 'TG3_HISTORY_PRIVATE_ORG_LEAK';
  end if;
  if public.world_public_office_history_v1('nonexistent-public-org') is not null then
    raise exception 'TG3_HISTORY_MISSING_ORG_LEAK';
  end if;

  if not has_function_privilege(
    'anon', 'public.world_public_office_history_v1(text,timestamptz,uuid,text,integer)',
    'execute'
  ) then
    raise exception 'TG3_HISTORY_ANON_RPC_NOT_GRANTED';
  end if;

  begin
    perform public.world_public_office_history_v1(
      v_slug, null, null, null, 21);
    raise exception 'TG3_HISTORY_UNBOUNDED_LIMIT_NOT_REJECTED';
  exception
    when sqlstate '22023' then null;
  end;

  raise notice 'PASS: TG3 office history snapshots, cursor, filters, privacy, limits, and grants';
end
$rehearse$;

rollback;

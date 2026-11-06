begin;

-- TG10 / S6 consumer contract. Candidate computation only; never dispatches,
-- inserts notification_deliveries, exposes private World data or changes a follow.
-- Requires TG9 published statement source (#2245) and the canonical TG10
-- fan_follow_categories extension (#2284). Integrate AFTER both.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      '20261107151000_v3_tg10_world_follow_notification_candidates',
      1, 'forward_fix_only', false, null,
      'Private, bounded official World statement follow-recipient candidates. Dispatch and S6 reconciliation require separate owner-reviewed integration.'
    );
  end if;
end $contract$;

-- No external caller can supply publication status, event importance, user
-- identity, title or destination. They are derived from the same canonical
-- immutable published-version records used by public World readers.
create or replace function private.world_statement_follow_notification_candidates_v1(
  p_statement_id uuid,
  p_after_user_id uuid default null,
  p_limit integer default 100
)
returns table(
  user_id uuid,
  category text,
  event_type text,
  subject_id text,
  dedupe_key text,
  route text,
  title text,
  body text,
  scheduled_for timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $candidates$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_FOLLOW_BATCH_LIMIT';
  end if;
  if p_statement_id is null then
    return;
  end if;

  return query
    select
      follow_row.profile_id,
      'following'::text,
      case
        when current_version.version_number > 1
          then 'world.statement.corrected'::text
        else 'world.statement.published'::text
      end,
      current_version.id::text,
      'world-statement:' || current_version.id::text || ':' || follow_row.profile_id::text,
      '/world/organizations/' || organization_row.slug,
      'Terra Solaris'::text,
      'An institution you follow published an official statement.'::text,
      current_version.published_at
    from public.world_statements statement_row
    join public.world_statement_versions current_version
      on current_version.id = statement_row.current_version_id
     and current_version.statement_id = statement_row.id
    join public.world_organizations organization_row
      on organization_row.id = statement_row.organization_id
    join public.fan_follows follow_row
      on follow_row.entity_type = 'organization'
     and follow_row.entity_id = organization_row.id
     and follow_row.notification_level in ('important', 'all')
     and (p_after_user_id is null or follow_row.profile_id > p_after_user_id)
    join public.notification_preferences preference
      on preference.profile_id = follow_row.profile_id
     and preference.external_enabled is true
     and 'following' = any(preference.categories)
    left join public.fan_follow_categories category_preference
      on category_preference.follow_id = follow_row.id
     and category_preference.category = 'statements'
    where statement_row.id = p_statement_id
      and public.studio2_feature_enabled('terra_world_public', null) is true
      and statement_row.status = 'published'
      and statement_row.visibility = 'public'
      and statement_row.published_at <= now()
      and current_version.published_at <= now()
      -- The bounded S6 push window must never replay old historical events
      -- simply because a feature flag or recipient consumer is enabled later.
      and current_version.published_at >= now() - interval '30 minutes'
      and organization_row.public_visibility = 'public'
      and organization_row.status in ('recognized', 'active')
      and coalesce(category_preference.enabled, true) is true
    order by follow_row.profile_id
    limit p_limit;
end
$candidates$;

-- This function is a private service contract. It must NOT be accessible to
-- browsers, and no service-role permission implies independent publication.
revoke all on function private.world_statement_follow_notification_candidates_v1(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function private.world_statement_follow_notification_candidates_v1(uuid,uuid,integer)
  to service_role;

comment on function private.world_statement_follow_notification_candidates_v1(uuid,uuid,integer) is
  'TG10 private paginated S6 candidate projection for current published official statement versions. Consumers must revalidate public source + preferences before push dispatch; no delivery or event is created here.';

commit;

begin;

-- Organisation OS V5 community identity moderation.
--
-- Public fan display identity is moderatable without changing prediction
-- entries, scores or historical competitive data.

insert into public.studio2_capabilities (key, domain, label, description, access_level)
values
  (
    'community.read',
    'community',
    'View community moderation',
    'View public fan identities and their moderation state.',
    'read'
  ),
  (
    'community.moderate',
    'community',
    'Moderate community identity',
    'Hide or restore public fan identity without altering predictions or scores.',
    'administer'
  )
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('superadmin', 'community.read'),
  ('superadmin', 'community.moderate'),
  ('organizer', 'community.read'),
  ('organizer', 'community.moderate'),
  ('integrity_officer', 'community.read'),
  ('integrity_officer', 'community.moderate')
on conflict do nothing;

alter table public.fan_profiles
  add column if not exists moderation_hidden_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null;

create or replace function private.studio2_guard_fan_profile_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if
    new.moderation_hidden_at is distinct from old.moderation_hidden_at
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_by is distinct from old.moderated_by
  then
    if not private.studio2_request_is_service_role()
       and not private.studio2_user_has_capability(auth.uid(), 'community.moderate', null) then
      raise exception 'Community moderation fields are Organizer-managed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists studio2_fan_profile_moderation_guard
  on public.fan_profiles;
create trigger studio2_fan_profile_moderation_guard
before update on public.fan_profiles
for each row execute function private.studio2_guard_fan_profile_moderation_fields();

revoke all on function private.studio2_guard_fan_profile_moderation_fields()
  from public, anon, authenticated;

create or replace function public.admin_fan_profile_moderation(
  p_limit integer default 100,
  p_query text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.studio2_access_allowed('community.read', null, false) then
    raise exception 'Missing Solaris capability: community.read' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'profileId', profile.id,
        'displayName', profile.display_name,
        'visibility', profile.visibility,
        'leaderboardOptIn', profile.leaderboard_opt_in,
        'hiddenAt', profile.moderation_hidden_at,
        'moderationReason', profile.moderation_reason,
        'updatedAt', profile.updated_at,
        'predictionCount', (
          select count(*)
          from public.prediction_entries entry
          where entry.profile_id = profile.id
        )
      )
      order by
        (profile.moderation_hidden_at is not null) desc,
        profile.updated_at desc,
        profile.display_name
    )
    from (
      select fan.*
      from public.fan_profiles fan
      where
        v_query is null
        or fan.display_name ilike '%' || v_query || '%'
      order by
        (fan.moderation_hidden_at is not null) desc,
        fan.updated_at desc
      limit v_limit
    ) profile
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_fan_profile_moderation(integer, text)
  from public, anon;
grant execute on function public.admin_fan_profile_moderation(integer, text)
  to authenticated, service_role;

create or replace function public.admin_set_fan_profile_moderation(
  p_profile_id uuid,
  p_hidden boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.fan_profiles;
  v_after public.fan_profiles;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.studio2_access_allowed('community.moderate', null, false) then
    raise exception 'Missing Solaris capability: community.moderate' using errcode = '42501';
  end if;

  if p_hidden and v_reason is null then
    raise exception 'A moderation reason is required when hiding a public identity'
      using errcode = '22023';
  end if;

  select *
  into v_before
  from public.fan_profiles
  where id = p_profile_id
  for update;

  if v_before.id is null then
    raise exception 'Fan profile not found' using errcode = 'P0002';
  end if;

  update public.fan_profiles
  set
    moderation_hidden_at = case when p_hidden then now() else null end,
    moderation_reason = case when p_hidden then v_reason else null end,
    moderated_by = auth.uid(),
    updated_at = now()
  where id = p_profile_id
  returning * into v_after;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    case when p_hidden then 'hide_fan_profile_identity' else 'restore_fan_profile_identity' end,
    'fan_profiles',
    p_profile_id::text,
    jsonb_build_object(
      'displayName', v_before.display_name,
      'visibility', v_before.visibility,
      'leaderboardOptIn', v_before.leaderboard_opt_in,
      'hiddenAt', v_before.moderation_hidden_at,
      'moderationReason', v_before.moderation_reason
    ),
    jsonb_build_object(
      'displayName', v_after.display_name,
      'visibility', v_after.visibility,
      'leaderboardOptIn', v_after.leaderboard_opt_in,
      'hiddenAt', v_after.moderation_hidden_at,
      'moderationReason', v_after.moderation_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'profileId', p_profile_id,
    'hidden', p_hidden,
    'hiddenAt', v_after.moderation_hidden_at
  );
end
$$;

revoke all on function public.admin_set_fan_profile_moderation(uuid, boolean, text)
  from public, anon;
grant execute on function public.admin_set_fan_profile_moderation(uuid, boolean, text)
  to authenticated, service_role;

create or replace function public.prediction_league_leaderboard(
  _edition_id uuid default null
)
returns table (
  "profileId" uuid,
  "displayName" text,
  score numeric,
  rounds bigint,
  "position" bigint,
  "lastScoredAt" timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      profile.id as profile_id,
      profile.display_name,
      sum(score.score)::numeric as total_score,
      count(*)::bigint as scored_rounds,
      max(score.scored_at) as last_scored_at
    from public.prediction_scores score
    join public.prediction_entries entry on entry.id = score.entry_id
    join public.prediction_rounds round on round.id = entry.round_id
    join public.shows show on show.id = round.show_id
    join public.fan_profiles profile on profile.id = entry.profile_id
    join public.editions edition on edition.id = show.edition_id
    where profile.visibility = 'public'
      and profile.leaderboard_opt_in = true
      and profile.moderation_hidden_at is null
      and round.status = 'scored'
      and edition.published = true
      and (_edition_id is null or show.edition_id = _edition_id)
      and public.show_publication_enabled(round.show_id, 'results')
    group by profile.id, profile.display_name
  )
  select
    eligible.profile_id as "profileId",
    eligible.display_name as "displayName",
    eligible.total_score as score,
    eligible.scored_rounds as rounds,
    dense_rank() over (
      order by eligible.total_score desc, eligible.scored_rounds desc
    )::bigint as "position",
    eligible.last_scored_at as "lastScoredAt"
  from eligible
  order by "position", eligible.display_name;
$$;

revoke all on function public.prediction_league_leaderboard(uuid) from public;
grant execute on function public.prediction_league_leaderboard(uuid)
  to anon, authenticated, service_role;

create or replace function public.shared_prediction(_share_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare shared_payload jsonb;
begin
  select jsonb_build_object(
    'entryId', entry.id,
    'showId', round_row.show_id,
    'displayName', case
      when profile.moderation_hidden_at is null
        and profile.visibility in ('public', 'unlisted')
      then profile.display_name
      else 'Solaris fan'
    end,
    'score', score.score,
    'percentile', score.percentile,
    'breakdown', score.breakdown,
    'scoringVersion', score.scoring_version,
    'scoredAt', score.scored_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryId', item.country_id,
        'type', item.prediction_type,
        'rank', item.rank,
        'confidence', item.confidence
      ) order by item.prediction_type, item.rank nulls last, item.created_at)
      from public.prediction_items item where item.entry_id = entry.id
    ), '[]'::jsonb)
  ) into shared_payload
  from public.prediction_entries entry
  join public.prediction_rounds round_row on round_row.id = entry.round_id
  join public.prediction_scores score on score.entry_id = entry.id
  join public.fan_profiles profile on profile.id = entry.profile_id
  where entry.share_token = _share_token
    and entry.state = 'scored'
    and public.show_publication_enabled(round_row.show_id, 'results');

  if shared_payload is null then raise exception 'Shared prediction not found'; end if;
  return shared_payload;
end;
$$;

revoke all on function public.shared_prediction(uuid) from public;
grant execute on function public.shared_prediction(uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

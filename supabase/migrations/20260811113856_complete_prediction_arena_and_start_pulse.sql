-- ============================================================
-- COMPLETE PHASE 2: PREDICTION ARENA
-- START PHASE 3: PULSE, FOLLOWS AND IN-APP UPDATES
--
-- This migration is additive to 20260812005000. Predictions remain private,
-- scoring is organizer-only, and public sharing uses an explicit unguessable
-- token. Phase 3 begins with opt-in follows and a public content-event feed.
-- ============================================================

-- ------------------------------------------------------------
-- PHASE 2: RESULT-LINKED SHARING
-- ------------------------------------------------------------

alter table public.prediction_entries
add column if not exists share_token uuid;

create unique index if not exists prediction_entries_share_token_idx
on public.prediction_entries (share_token)
where share_token is not null;

-- ------------------------------------------------------------
-- PHASE 2: SERVER-SIDE SCORING
-- ------------------------------------------------------------

create or replace function public.score_prediction_round(
  _round_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  round_row public.prediction_rounds%rowtype;
  entry_row public.prediction_entries%rowtype;
  scored_count integer := 0;
  result_count integer := 0;
  predicted_count integer := 0;
  actual_count integer := 0;
  hit_count integer := 0;
  qualifier_component numeric;
  headline_component numeric;
  ranking_component numeric;
  confidence_component numeric;
  headline_weight numeric;
  headline_hit_weight numeric;
  ranking_type text;
  ranking_count integer;
  ranking_distance numeric;
  ranking_max_distance numeric;
  confidence_count integer;
  confidence_error numeric;
  component_count integer;
  base_score numeric;
  total_score numeric;
  breakdown_payload jsonb;
begin
  if current_user_id is null
    or not public.has_role(current_user_id, 'organizer'::public.app_role)
  then
    raise exception 'Organizer access required';
  end if;

  select *
  into round_row
  from public.prediction_rounds
  where id = _round_id
  for update;

  if round_row.id is null then
    raise exception 'Prediction round not found';
  end if;

  if round_row.status in ('draft', 'cancelled')
    or now() < round_row.locks_at
  then
    raise exception 'Prediction round must be locked before scoring';
  end if;

  if not public.show_publication_enabled(round_row.show_id, 'results') then
    raise exception 'Published results are required before scoring';
  end if;

  select count(*)::integer
  into result_count
  from public.results result
  where result.show_id = round_row.show_id
    and result.final_rank is not null
    and coalesce(result.contest_entity_id, result.country_id) is not null;

  if result_count = 0 then
    raise exception 'No ranked results are available for this show';
  end if;

  update public.prediction_entries
  set
    state = 'locked',
    locked_at = coalesce(locked_at, round_row.locks_at),
    updated_at = now()
  where round_id = _round_id
    and state = 'submitted';

  update public.prediction_rounds
  set status = 'scoring', updated_at = now()
  where id = _round_id;

  delete from public.prediction_scores score
  using public.prediction_entries entry
  where score.entry_id = entry.id
    and entry.round_id = _round_id;

  for entry_row in
    select *
    from public.prediction_entries
    where round_id = _round_id
      and state in ('locked', 'scored')
    order by created_at, id
  loop
    qualifier_component := null;
    headline_component := null;
    ranking_component := null;
    confidence_component := null;

    if exists (
      select 1
      from public.prediction_items item
      where item.entry_id = entry_row.id
        and item.prediction_type = 'qualifier'
    ) then
      select count(*)::integer
      into predicted_count
      from public.prediction_items item
      where item.entry_id = entry_row.id
        and item.prediction_type = 'qualifier';

      select count(*)::integer
      into actual_count
      from public.participants participant
      where participant.show_id = round_row.show_id
        and participant.qualified is true
        and coalesce(participant.contest_entity_id, participant.country_id) is not null;

      select count(*)::integer
      into hit_count
      from public.prediction_items item
      where item.entry_id = entry_row.id
        and item.prediction_type = 'qualifier'
        and exists (
          select 1
          from public.participants participant
          where participant.show_id = round_row.show_id
            and participant.qualified is true
            and coalesce(participant.contest_entity_id, participant.country_id) = item.country_id
        );

      qualifier_component := case
        when predicted_count + actual_count = 0 then 0
        else (200.0 * hit_count) / (predicted_count + actual_count)
      end;
    end if;

    headline_weight := 0;
    headline_hit_weight := 0;

    if exists (
      select 1 from public.prediction_items item
      where item.entry_id = entry_row.id and item.prediction_type = 'winner'
    ) then
      headline_weight := headline_weight + 1;
      if exists (
        select 1
        from public.prediction_items item
        join public.results result
          on result.show_id = round_row.show_id
         and coalesce(result.contest_entity_id, result.country_id) = item.country_id
         and result.final_rank = 1
        where item.entry_id = entry_row.id
          and item.prediction_type = 'winner'
      ) then
        headline_hit_weight := headline_hit_weight + 1;
      end if;
    end if;

    if exists (
      select 1 from public.prediction_items item
      where item.entry_id = entry_row.id and item.prediction_type = 'jury_winner'
    ) then
      headline_weight := headline_weight + 0.75;
      if exists (
        select 1
        from public.prediction_items item
        join public.results result
          on result.show_id = round_row.show_id
         and coalesce(result.contest_entity_id, result.country_id) = item.country_id
        where item.entry_id = entry_row.id
          and item.prediction_type = 'jury_winner'
          and result.jury_points = (
            select max(candidate.jury_points)
            from public.results candidate
            where candidate.show_id = round_row.show_id
          )
      ) then
        headline_hit_weight := headline_hit_weight + 0.75;
      end if;
    end if;

    if exists (
      select 1 from public.prediction_items item
      where item.entry_id = entry_row.id and item.prediction_type = 'televote_winner'
    ) then
      headline_weight := headline_weight + 0.75;
      if exists (
        select 1
        from public.prediction_items item
        join public.results result
          on result.show_id = round_row.show_id
         and coalesce(result.contest_entity_id, result.country_id) = item.country_id
        where item.entry_id = entry_row.id
          and item.prediction_type = 'televote_winner'
          and result.televote_points = (
            select max(candidate.televote_points)
            from public.results candidate
            where candidate.show_id = round_row.show_id
          )
      ) then
        headline_hit_weight := headline_hit_weight + 0.75;
      end if;
    end if;

    if headline_weight > 0 then
      headline_component := (headline_hit_weight / headline_weight) * 100;
    end if;

    select case
      when exists (
        select 1 from public.prediction_items item
        where item.entry_id = entry_row.id and item.prediction_type = 'full_ranking'
      ) then 'full_ranking'
      when exists (
        select 1 from public.prediction_items item
        where item.entry_id = entry_row.id and item.prediction_type = 'top_ten'
      ) then 'top_ten'
      when exists (
        select 1 from public.prediction_items item
        where item.entry_id = entry_row.id and item.prediction_type = 'top_three'
      ) then 'top_three'
      else null
    end
    into ranking_type;

    if ranking_type is not null then
      select count(*)::integer
      into ranking_count
      from public.prediction_items item
      where item.entry_id = entry_row.id
        and item.prediction_type = ranking_type
        and item.rank is not null;

      select coalesce(sum(abs(
        item.rank - case
          when result.final_rank between 1 and ranking_count then result.final_rank
          else ranking_count + 1
        end
      )), 0)::numeric
      into ranking_distance
      from public.prediction_items item
      left join public.results result
        on result.show_id = round_row.show_id
       and coalesce(result.contest_entity_id, result.country_id) = item.country_id
      where item.entry_id = entry_row.id
        and item.prediction_type = ranking_type
        and item.rank is not null;

      ranking_max_distance := floor((ranking_count * ranking_count)::numeric / 2);
      ranking_component := case
        when ranking_count = 1 then 100
        else greatest(
          0,
          least(100, (1 - ranking_distance / greatest(1, ranking_max_distance)) * 100)
        )
      end;
    end if;

    select
      count(*)::integer,
      avg(
        power(
          item.confidence - case
            when item.prediction_type = 'qualifier' then
              case when exists (
                select 1 from public.participants participant
                where participant.show_id = round_row.show_id
                  and participant.qualified is true
                  and coalesce(participant.contest_entity_id, participant.country_id) = item.country_id
              ) then 1 else 0 end
            when item.prediction_type = 'winner' then
              case when exists (
                select 1 from public.results result
                where result.show_id = round_row.show_id
                  and result.final_rank = 1
                  and coalesce(result.contest_entity_id, result.country_id) = item.country_id
              ) then 1 else 0 end
            when item.prediction_type = 'jury_winner' then
              case when exists (
                select 1 from public.results result
                where result.show_id = round_row.show_id
                  and coalesce(result.contest_entity_id, result.country_id) = item.country_id
                  and result.jury_points = (
                    select max(candidate.jury_points)
                    from public.results candidate
                    where candidate.show_id = round_row.show_id
                  )
              ) then 1 else 0 end
            when item.prediction_type = 'televote_winner' then
              case when exists (
                select 1 from public.results result
                where result.show_id = round_row.show_id
                  and coalesce(result.contest_entity_id, result.country_id) = item.country_id
                  and result.televote_points = (
                    select max(candidate.televote_points)
                    from public.results candidate
                    where candidate.show_id = round_row.show_id
                  )
              ) then 1 else 0 end
            when item.rank is not null then
              case when exists (
                select 1 from public.results result
                where result.show_id = round_row.show_id
                  and result.final_rank = item.rank
                  and coalesce(result.contest_entity_id, result.country_id) = item.country_id
              ) then 1 else 0 end
            else 0
          end,
          2
        )
      )
    into confidence_count, confidence_error
    from public.prediction_items item
    where item.entry_id = entry_row.id
      and item.confidence is not null;

    if confidence_count > 0 then
      confidence_component := greatest(0, least(100, (1 - confidence_error) * 100));
    end if;

    component_count :=
      case when qualifier_component is null then 0 else 1 end +
      case when headline_component is null then 0 else 1 end +
      case when ranking_component is null then 0 else 1 end;

    base_score := case
      when component_count = 0 then 0
      else (
        coalesce(qualifier_component, 0) +
        coalesce(headline_component, 0) +
        coalesce(ranking_component, 0)
      ) / component_count
    end;

    total_score := greatest(
      0,
      least(
        100,
        case
          when confidence_component is null then base_score
          else base_score * 0.9 + confidence_component * 0.1
        end
      )
    );

    breakdown_payload := jsonb_strip_nulls(jsonb_build_object(
      'qualifierScore', qualifier_component,
      'headlineScore', headline_component,
      'rankingScore', ranking_component,
      'confidenceScore', confidence_component,
      'scoringVersion', round_row.scoring_version
    ));

    insert into public.prediction_scores (
      entry_id,
      score,
      percentile,
      breakdown,
      scoring_version,
      scored_at
    )
    values (
      entry_row.id,
      round(total_score, 3),
      null,
      breakdown_payload,
      round_row.scoring_version,
      now()
    );

    update public.prediction_entries
    set state = 'scored', updated_at = now()
    where id = entry_row.id;

    scored_count := scored_count + 1;
  end loop;

  with ranked_scores as (
    select
      score.entry_id,
      round(
        (cume_dist() over (order by score.score) * 100)::numeric,
        3
      ) as percentile
    from public.prediction_scores score
    join public.prediction_entries entry on entry.id = score.entry_id
    where entry.round_id = _round_id
  )
  update public.prediction_scores score
  set percentile = ranked.percentile
  from ranked_scores ranked
  where score.entry_id = ranked.entry_id;

  update public.prediction_rounds
  set status = 'scored', updated_at = now()
  where id = _round_id;

  return scored_count;
end;
$$;

revoke all
on function public.score_prediction_round(uuid)
from public, anon, authenticated;

grant execute
on function public.score_prediction_round(uuid)
to authenticated, service_role;

-- A fan explicitly opts one scored entry into link sharing. The token reveals
-- the prediction and score, never the profile ID or email address.
create or replace function public.enable_prediction_share(
  _entry_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  generated_token uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.prediction_entries entry
  set share_token = coalesce(entry.share_token, gen_random_uuid())
  where entry.id = _entry_id
    and entry.profile_id = current_user_id
    and entry.state = 'scored'
  returning entry.share_token into generated_token;

  if generated_token is null then
    raise exception 'Only your scored prediction can be shared';
  end if;

  return generated_token;
end;
$$;

revoke all
on function public.enable_prediction_share(uuid)
from public, anon;

grant execute
on function public.enable_prediction_share(uuid)
to authenticated, service_role;

create or replace function public.shared_prediction(
  _share_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shared_payload jsonb;
begin
  select jsonb_build_object(
    'entryId', entry.id,
    'showId', round_row.show_id,
    'displayName', case
      when profile.visibility in ('public', 'unlisted') then profile.display_name
      else 'Solaris fan'
    end,
    'score', score.score,
    'percentile', score.percentile,
    'breakdown', score.breakdown,
    'scoringVersion', score.scoring_version,
    'scoredAt', score.scored_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryId', item.country_id,
          'type', item.prediction_type,
          'rank', item.rank,
          'confidence', item.confidence
        )
        order by item.prediction_type, item.rank nulls last, item.created_at
      )
      from public.prediction_items item
      where item.entry_id = entry.id
    ), '[]'::jsonb)
  )
  into shared_payload
  from public.prediction_entries entry
  join public.prediction_rounds round_row on round_row.id = entry.round_id
  join public.prediction_scores score on score.entry_id = entry.id
  join public.fan_profiles profile on profile.id = entry.profile_id
  where entry.share_token = _share_token
    and entry.state = 'scored'
    and public.show_publication_enabled(round_row.show_id, 'results');

  if shared_payload is null then
    raise exception 'Shared prediction not found';
  end if;

  return shared_payload;
end;
$$;

revoke all
on function public.shared_prediction(uuid)
from public;

grant execute
on function public.shared_prediction(uuid)
to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- PHASE 3 FOUNDATION: FOLLOWS, PULSE AND IN-APP READ STATE
-- ------------------------------------------------------------

create table if not exists public.fan_follows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  entity_type text not null check (entity_type in ('country', 'edition', 'show')),
  entity_id uuid not null,
  notification_level text not null default 'important'
    check (notification_level in ('all', 'important', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, entity_type, entity_id)
);

create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'entry_published',
    'running_order_published',
    'prediction_opened',
    'prediction_locked',
    'results_published',
    'record_broken',
    'story_published',
    'edition_update'
  )),
  entity_type text not null check (entity_type in ('country', 'edition', 'show')),
  entity_id uuid not null,
  title text not null check (char_length(title) between 1 and 140),
  summary text not null default '' check (char_length(summary) <= 400),
  route text not null check (route like '/%'),
  importance text not null default 'normal'
    check (importance in ('normal', 'important')),
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.fan_event_reads (
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  event_id uuid not null references public.content_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.fan_profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  categories text[] not null default array[
    'entries',
    'running_orders',
    'predictions',
    'results',
    'records'
  ]::text[],
  external_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (categories <@ array[
    'entries',
    'running_orders',
    'predictions',
    'results',
    'records'
  ]::text[])
);

create index if not exists fan_follows_profile_idx
on public.fan_follows (profile_id, created_at desc);

create index if not exists fan_follows_entity_idx
on public.fan_follows (entity_type, entity_id);

create index if not exists content_events_published_idx
on public.content_events (published_at desc);

alter table public.fan_follows enable row level security;
alter table public.content_events enable row level security;
alter table public.fan_event_reads enable row level security;
alter table public.notification_preferences enable row level security;

-- Explicit Data API grants are required for new Supabase tables created after
-- the 2026 default-grant change. RLS still determines which rows are visible.
grant select on public.fan_follows to authenticated;
grant select on public.content_events to anon, authenticated;
grant insert, update, delete on public.content_events to authenticated;
grant select on public.fan_event_reads to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

grant all on public.fan_follows to service_role;
grant all on public.content_events to service_role;
grant all on public.fan_event_reads to service_role;
grant all on public.notification_preferences to service_role;

create policy "fans read own follows"
on public.fan_follows for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy "public reads published content events"
on public.content_events for select
to anon, authenticated
using (published_at <= now());

create policy "organizers manage content events"
on public.content_events for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role))
with check (public.has_role((select auth.uid()), 'organizer'::public.app_role));

create policy "fans read own event state"
on public.fan_event_reads for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy "fans read own notification preferences"
on public.notification_preferences for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy "fans create own notification preferences"
on public.notification_preferences for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy "fans update own notification preferences"
on public.notification_preferences for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "fans delete own notification preferences"
on public.notification_preferences for delete
to authenticated
using ((select auth.uid()) = profile_id);

create or replace function public.set_fan_follow(
  _entity_type text,
  _entity_id uuid,
  _following boolean,
  _notification_level text default 'important'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  entity_is_available boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if _entity_type not in ('country', 'edition', 'show') then
    raise exception 'Unsupported follow type';
  end if;

  if _notification_level not in ('all', 'important', 'none') then
    raise exception 'Unsupported notification level';
  end if;

  entity_is_available := case _entity_type
    when 'country' then exists (
      select 1 from public.countries country where country.id = _entity_id
    )
    when 'edition' then exists (
      select 1 from public.editions edition
      where edition.id = _entity_id and edition.published is true
    )
    when 'show' then public.show_publication_enabled(_entity_id, 'participants')
    else false
  end;

  if not entity_is_available then
    raise exception 'This item is not available to follow';
  end if;

  insert into public.fan_profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  if _following then
    insert into public.fan_follows (
      profile_id,
      entity_type,
      entity_id,
      notification_level,
      updated_at
    )
    values (
      current_user_id,
      _entity_type,
      _entity_id,
      _notification_level,
      now()
    )
    on conflict (profile_id, entity_type, entity_id)
    do update set
      notification_level = excluded.notification_level,
      updated_at = now();
  else
    delete from public.fan_follows follow
    where follow.profile_id = current_user_id
      and follow.entity_type = _entity_type
      and follow.entity_id = _entity_id;
  end if;

  return _following;
end;
$$;

revoke all
on function public.set_fan_follow(text, uuid, boolean, text)
from public, anon;

grant execute
on function public.set_fan_follow(text, uuid, boolean, text)
to authenticated, service_role;

create or replace function public.mark_content_event_read(
  _event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.content_events event
    where event.id = _event_id
      and event.published_at <= now()
  ) then
    raise exception 'Content event not found';
  end if;

  insert into public.fan_profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  insert into public.fan_event_reads (profile_id, event_id, read_at)
  values (current_user_id, _event_id, now())
  on conflict (profile_id, event_id)
  do update set read_at = excluded.read_at;
end;
$$;

revoke all
on function public.mark_content_event_read(uuid)
from public, anon;

grant execute
on function public.mark_content_event_read(uuid)
to authenticated, service_role;

comment on function public.score_prediction_round(uuid) is
  'Organizer-only, reproducible v1 scoring for a locked prediction round.';

comment on function public.shared_prediction(uuid) is
  'Returns one explicitly shared scored prediction without exposing profile IDs.';

comment on table public.content_events is
  'Curated publication events used by Solaris Pulse and the in-app inbox.';

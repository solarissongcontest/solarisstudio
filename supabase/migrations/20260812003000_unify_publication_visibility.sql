-- ============================================================
-- UNIFY PUBLICATION VISIBILITY
--
-- Fixes the old split-brain publication model where:
--   * editions.published could be true,
--   * every show could still be private,
--   * publication_config could still hide every public layer,
--   * and RLS only checked shows.published instead of the layer.
--
-- After this migration:
--   * show publication_config is the public-data source of truth,
--   * editions are derived from their shows,
--   * legacy published editions/shows are repaired,
--   * RLS protects each public layer separately,
--   * private jury/televote ballots are not queryable anonymously,
--   * themes referenced by a public edition/show can be read publicly.
-- ============================================================

alter table public.shows
  add column if not exists publication_config jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 1. REPAIR LEGACY "PUBLISHED EDITION / ZERO PUBLISHED SHOWS"
--
-- The old Manage Editions button only changed editions.published.
-- If an edition is marked public but literally none of its shows
-- are public, treat that as legacy intent and release the shows
-- using the normal "Results" preset.
--
-- We deliberately DO NOT touch intentionally private shows inside
-- an edition that already has at least one correctly public show.
-- ------------------------------------------------------------

with legacy_editions as (
  select e.id
  from public.editions e
  where e.published = true
    and exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
    )
    and not exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
        and s.published = true
    )
)
update public.shows s
set
  published = true,
  publication_config = jsonb_build_object(
    'participants', true,
    'artists', true,
    'songs', true,
    'semi_split', true,
    'running_order', true,
    'qualifiers', true,
    'results', true,
    'jury_results', true,
    'televote_results', true,
    'detailed_voting', false
  )
where s.edition_id in (
  select id
  from legacy_editions
);

-- ------------------------------------------------------------
-- 2. REPAIR LEGACY PUBLISHED SHOWS WITH NO REAL CONFIG
--
-- Some shows predate publication_config. A published show in that
-- old model meant the normal public result page was intended.
-- Backfill the safe Results preset, but do not expose detailed
-- ballots automatically.
-- ------------------------------------------------------------

update public.shows s
set publication_config = jsonb_build_object(
  'participants', true,
  'artists', true,
  'songs', true,
  'semi_split', true,
  'running_order', true,
  'qualifiers', true,
  'results', true,
  'jury_results', true,
  'televote_results', true,
  'detailed_voting', false
)
where s.published = true
  and (
    s.publication_config is null
    or s.publication_config = '{}'::jsonb
    or not (
      coalesce((s.publication_config ->> 'participants')::boolean, false)
      or coalesce((s.publication_config ->> 'artists')::boolean, false)
      or coalesce((s.publication_config ->> 'songs')::boolean, false)
      or coalesce((s.publication_config ->> 'semi_split')::boolean, false)
      or coalesce((s.publication_config ->> 'running_order')::boolean, false)
      or coalesce((s.publication_config ->> 'qualifiers')::boolean, false)
      or coalesce((s.publication_config ->> 'results')::boolean, false)
      or coalesce((s.publication_config ->> 'jury_results')::boolean, false)
      or coalesce((s.publication_config ->> 'televote_results')::boolean, false)
      or coalesce((s.publication_config ->> 'detailed_voting')::boolean, false)
    )
  );

-- ------------------------------------------------------------
-- 3. CENTRAL RLS VISIBILITY HELPER
--
-- SECURITY DEFINER is intentional. Policies on child tables need
-- to inspect shows without recursively applying show RLS.
--
-- Empty config remains a legacy fallback for safety when restoring
-- old backups, even though the backfill above repairs current rows.
-- ------------------------------------------------------------

create or replace function public.show_publication_enabled(
  _show_id uuid,
  _key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = _show_id
      and s.published = true
      and s.publication_config ->> _key = 'true'
  );
$$;

revoke all
on function public.show_publication_enabled(uuid, text)
from public;

grant execute
on function public.show_publication_enabled(uuid, text)
to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4. EDITIONS ARE DERIVED FROM THEIR SHOWS
-- ------------------------------------------------------------

update public.editions e
set
  published = exists (
    select 1
    from public.shows s
    where s.edition_id = e.id
      and s.published = true
      and (
        s.publication_config ->> 'participants' = 'true'
        or s.publication_config ->> 'artists' = 'true'
        or s.publication_config ->> 'songs' = 'true'
        or s.publication_config ->> 'semi_split' = 'true'
        or s.publication_config ->> 'running_order' = 'true'
        or s.publication_config ->> 'qualifiers' = 'true'
        or s.publication_config ->> 'results' = 'true'
        or s.publication_config ->> 'jury_results' = 'true'
        or s.publication_config ->> 'televote_results' = 'true'
        or s.publication_config ->> 'detailed_voting' = 'true'
      )
  ),
  status = case
    when exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
        and s.published = true
        and s.kind in ('grand-final', 'final')
        and s.publication_config ->> 'results' = 'true'
    )
      then 'completed'
    when exists (
      select 1
      from public.shows s
      where s.edition_id = e.id
        and s.published = true
        and (
s.publication_config ->> 'participants' = 'true'
          or s.publication_config ->> 'artists' = 'true'
          or s.publication_config ->> 'songs' = 'true'
          or s.publication_config ->> 'semi_split' = 'true'
          or s.publication_config ->> 'running_order' = 'true'
          or s.publication_config ->> 'qualifiers' = 'true'
          or s.publication_config ->> 'results' = 'true'
          or s.publication_config ->> 'jury_results' = 'true'
          or s.publication_config ->> 'televote_results' = 'true'
          or s.publication_config ->> 'detailed_voting' = 'true'
        )
    )
      then 'published'
    else 'draft'
  end;

-- ------------------------------------------------------------
-- 5. SHOWS
--
-- shows.published is still the route-level gate. The individual
-- data tables below enforce the exact publication layer.
-- ------------------------------------------------------------

drop policy if exists "shows public read published"
on public.shows;

create policy "shows public read published"
on public.shows
for select
using (
  published
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 6. PARTICIPANTS
-- ------------------------------------------------------------

drop policy if exists "participants public read"
on public.participants;

drop policy if exists "participants public read published"
on public.participants;

create policy "participants public read by publication"
on public.participants
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(
      show_id,
      'participants'
    )
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = participants.edition_id
        and e.published = true
    )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 7. ARCHIVED RESULTS
-- ------------------------------------------------------------

drop policy if exists "results public read"
on public.results;

drop policy if exists "results public read published"
on public.results;

create policy "results public read by publication"
on public.results
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(
      show_id,
      'results'
    )
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = results.edition_id
        and e.published = true
    )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 8. RAW JURY BALLOTS
--
-- Jury TOTALS displayed on public scoreboards come from results.
-- The raw jury_votes table reveals individual ballots, so it is
-- only public when detailed_voting is enabled.
-- ------------------------------------------------------------

drop policy if exists "jury public read"
on public.jury_votes;

drop policy if exists "jury public read published"
on public.jury_votes;

create policy "jury public read detailed only"
on public.jury_votes
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(
      show_id,
      'detailed_voting'
    )
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = jury_votes.edition_id
        and e.published = true
    )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 9. RAW TELEVOTE DATA
--
-- Same rule as raw jury ballots. Public televote totals live in
-- results; raw vote rows require detailed_voting.
-- ------------------------------------------------------------

drop policy if exists "televote public read"
on public.televote_votes;

drop policy if exists "televote public read published"
on public.televote_votes;

create policy "televote public read detailed only"
on public.televote_votes
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(
      show_id,
      'detailed_voting'
    )
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = televote_votes.edition_id
        and e.published = true
    )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 10. VOTERS
--
-- Voter identities are only needed for detailed ballot views.
-- ------------------------------------------------------------

drop policy if exists "voters public read"
on public.voters;

drop policy if exists "voters public read published"
on public.voters;

create policy "voters public read detailed only"
on public.voters
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(
      show_id,
      'detailed_voting'
    )
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = voters.edition_id
        and e.published = true
    )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 11. CONTEST ENTITIES
--
-- An edition-wide entity can reveal a custom country/delegation.
-- Only expose entities that are actually attached to a participant
-- row whose participant layer is public.
-- ------------------------------------------------------------

drop policy if exists "contest entities public read published"
on public.contest_entities;

create policy "contest entities public read by participants"
on public.contest_entities
for select
using (
  exists (
    select 1
    from public.participants p
    where p.edition_id = contest_entities.edition_id
      and (
        p.contest_entity_id = contest_entities.id
        or (
          contest_entities.country_id is not null
          and p.country_id = contest_entities.country_id
        )
      )
      and (
        (
          p.show_id is not null
          and public.show_publication_enabled(
            p.show_id,
            'participants'
          )
        )
        or (
          p.show_id is null
          and exists (
            select 1
            from public.editions e
            where e.id = p.edition_id
              and e.published = true
          )
        )
      )
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 12. THEMES
--
-- Themes created in Studio default to private library items, but a
-- theme referenced by a public edition/show must still be readable
-- by the public site so the published scoreboard keeps its design.
-- ------------------------------------------------------------

drop policy if exists "themes public read"
on public.themes;

create policy "themes public read"
on public.themes
for select
using (
  is_public
  or exists (
    select 1
    from public.shows s
    where s.theme_id = themes.id
      and s.published = true
  )
  or exists (
    select 1
    from public.editions e
    where e.theme_id = themes.id
      and e.published = true
  )
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);

-- ------------------------------------------------------------
-- 13. EDITION READ POLICY
-- ------------------------------------------------------------

drop policy if exists "editions public read"
on public.editions;

create policy "editions public read"
on public.editions
for select
using (
  published
  or public.has_role(
    auth.uid(),
    'organizer'::public.app_role
  )
);


-- ============================================================
-- 14. AUTOMATIC RESULT ARCHIVE
--
-- Public pages intentionally read public standings from results,
-- not directly from mutable vote-entry tables.
--
-- Previously an organizer had to remember a separate "save results"
-- action before publishing. That is too easy to miss and is exactly
-- how an edition can be public while every result page looks empty.
--
-- This function reproduces the app's computeStandings rules:
--   * jury + televote totals
--   * optional weighted scoring
--   * configurable top score
--   * configured tie-break chain
--   * running order as the stable final fallback
-- ============================================================

create or replace function public.refresh_show_results(
  p_show_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition_id uuid;
  v_voting jsonb;
  v_jury_weight numeric;
  v_tele_weight numeric;
  v_weighted boolean;
  v_top_score integer;
  v_ties jsonb;
  v_count integer;
begin
  if auth.uid() is not null
    and not public.has_role(
      auth.uid(),
      'organizer'::public.app_role
    )
  then
    raise exception 'Only organizers can refresh show results.'
      using errcode = '42501';
  end if;

  select
    s.edition_id,
    coalesce(s.voting_config, '{}'::jsonb)
  into
    v_edition_id,
    v_voting
  from public.shows s
  where s.id = p_show_id;

  if v_edition_id is null then
    raise exception 'Show not found.' using errcode = 'P0002';
  end if;

  v_jury_weight :=
    coalesce(
      nullif(
        v_voting #>> '{weighting,jury}',
        ''
      )::numeric,
      50
    );

  v_tele_weight :=
    coalesce(
      nullif(
        v_voting #>> '{weighting,televote}',
        ''
      )::numeric,
      50
    );

  v_weighted :=
    coalesce(
      nullif(
        v_voting ->> 'weightedScoring',
        ''
      )::boolean,
      false
    );

  v_top_score :=
    coalesce(
      nullif(
        v_voting #>> '{juryPoints,0}',
        ''
      )::integer,
      12
    );

  v_ties :=
    case
      when jsonb_typeof(
        v_voting -> 'tieBreak'
      ) = 'array'
      and jsonb_array_length(
        v_voting -> 'tieBreak'
      ) > 0
        then v_voting -> 'tieBreak'
      else '["televote","twelves","jury"]'::jsonb
    end;

  delete from public.results
  where show_id = p_show_id;

  with participant_rows as (
    select
      p.id,
      p.edition_id,
      p.show_id,
      p.country_id,
      p.contest_entity_id,
      coalesce(
        p.contest_entity_id,
        p.country_id
      ) as identity_id,
      p.running_order
    from public.participants p
    where p.show_id = p_show_id
  ),
  jury_totals as (
    select
      coalesce(
        j.receiving_entity_id,
        j.receiving_country_id
      ) as identity_id,
      coalesce(
        sum(j.points),
        0
      )::integer as jury_points,
      count(*) filter (
        where j.points = v_top_score
      )::integer as top_scores
    from public.jury_votes j
    where j.show_id = p_show_id
    group by
      coalesce(
        j.receiving_entity_id,
        j.receiving_country_id
      )
  ),
  tele_totals as (
    select
      coalesce(
        t.contest_entity_id,
        t.country_id
      ) as identity_id,
      coalesce(
        sum(t.points),
        0
      )::integer as televote_points
    from public.televote_votes t
    where t.show_id = p_show_id
    group by
      coalesce(
        t.contest_entity_id,
        t.country_id
      )
  ),
  scored as (
    select
      p.country_id,
      p.contest_entity_id,
      p.identity_id,
      p.running_order,
      coalesce(
        j.jury_points,
        0
      )::integer as jury_points,
      coalesce(
        t.televote_points,
        0
      )::integer as televote_points,
      coalesce(
        j.top_scores,
        0
      )::integer as top_scores,
      case
        when v_weighted then
          round(
            coalesce(
              j.jury_points,
              0
            ) * (
              v_jury_weight /
              50.0
            )
            +
            coalesce(
              t.televote_points,
              0
            ) * (
              v_tele_weight /
              50.0
            )
          )::integer
        else
          (
            coalesce(
              j.jury_points,
              0
            )
            +
            coalesce(
              t.televote_points,
              0
            )
          )::integer
      end as total_points
    from participant_rows p
    left join jury_totals j
      on j.identity_id = p.identity_id
    left join tele_totals t
      on t.identity_id = p.identity_id
  ),
  ranked as (
    select
      s.*,
      row_number() over (
        order by
          s.total_points desc,

          case
            when v_ties ->> 0 = 'televote'
              then s.televote_points
            when v_ties ->> 0 = 'jury'
              then s.jury_points
            when v_ties ->> 0 in (
              'twelves',
              'countback'
            )
              then s.top_scores
            when v_ties ->> 0 = 'runningOrder'
              then coalesce(
                s.running_order,
                999
              )
            else 0
          end desc,

          case
            when v_ties ->> 1 = 'televote'
              then s.televote_points
            when v_ties ->> 1 = 'jury'
              then s.jury_points
            when v_ties ->> 1 in (
              'twelves',
              'countback'
            )
              then s.top_scores
            when v_ties ->> 1 = 'runningOrder'
              then coalesce(
                s.running_order,
                999
              )
            else 0
          end desc,

          case
            when v_ties ->> 2 = 'televote'
              then s.televote_points
            when v_ties ->> 2 = 'jury'
              then s.jury_points
            when v_ties ->> 2 in (
              'twelves',
              'countback'
            )
              then s.top_scores
            when v_ties ->> 2 = 'runningOrder'
              then coalesce(
                s.running_order,
                999
              )
            else 0
          end desc,

          case
            when v_ties ->> 3 = 'televote'
              then s.televote_points
            when v_ties ->> 3 = 'jury'
              then s.jury_points
            when v_ties ->> 3 in (
              'twelves',
              'countback'
            )
              then s.top_scores
            when v_ties ->> 3 = 'runningOrder'
              then coalesce(
                s.running_order,
                999
              )
            else 0
          end desc,

          case
            when v_ties ->> 4 = 'televote'
              then s.televote_points
            when v_ties ->> 4 = 'jury'
              then s.jury_points
            when v_ties ->> 4 in (
              'twelves',
              'countback'
            )
              then s.top_scores
            when v_ties ->> 4 = 'runningOrder'
              then coalesce(
                s.running_order,
                999
              )
            else 0
          end desc,

          -- JS Array.sort is stable. computeStandings receives
          -- participants in running-order order, so this mirrors
          -- its final unresolved-tie fallback.
          coalesce(
            s.running_order,
            999
          ) asc,
          s.identity_id asc
      )::integer as final_rank
    from scored s
  )
  insert into public.results (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    jury_points,
    televote_points,
    total_points,
    final_rank
  )
  select
    v_edition_id,
    p_show_id,
    r.country_id,
    r.contest_entity_id,
    r.jury_points,
    r.televote_points,
    r.total_points,
    r.final_rank
  from ranked r;

  get diagnostics
    v_count = row_count;

  return v_count;
end;
$$;

revoke all
on function public.refresh_show_results(uuid)
from public;

grant execute
on function public.refresh_show_results(uuid)
to authenticated, service_role;

-- ------------------------------------------------------------
-- 15. RESULT REFRESH TRIGGERS
--
-- When Results first becomes public, materialise the archive.
-- If an organizer later corrects a vote or participant while the
-- results are public, refresh the archive automatically.
-- ------------------------------------------------------------

create or replace function public.refresh_public_results_after_show_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.show_publication_enabled(
    new.id,
    'results'
  ) then
    perform public.refresh_show_results(
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_results_when_show_published
on public.shows;

create trigger trg_refresh_results_when_show_published
after update of published, publication_config, voting_config
on public.shows
for each row
execute function public.refresh_public_results_after_show_change();

create or replace function public.refresh_public_results_after_child_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_show_id uuid;
begin
  v_show_id :=
    case
      when tg_op = 'DELETE'
        then old.show_id
      else new.show_id
    end;

  if v_show_id is not null
    and public.show_publication_enabled(
      v_show_id,
      'results'
    )
  then
    perform public.refresh_show_results(
      v_show_id
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_results_after_participant_change
on public.participants;

create trigger trg_refresh_results_after_participant_change
after insert or update or delete
on public.participants
for each row
execute function public.refresh_public_results_after_child_change();

drop trigger if exists trg_refresh_results_after_jury_change
on public.jury_votes;

create trigger trg_refresh_results_after_jury_change
after insert or update or delete
on public.jury_votes
for each row
execute function public.refresh_public_results_after_child_change();

drop trigger if exists trg_refresh_results_after_televote_change
on public.televote_votes;

create trigger trg_refresh_results_after_televote_change
after insert or update or delete
on public.televote_votes
for each row
execute function public.refresh_public_results_after_child_change();

-- ------------------------------------------------------------
-- 16. BUILD MISSING ARCHIVES FOR RESULTS THAT ARE ALREADY PUBLIC
-- ------------------------------------------------------------

do $$
declare
  v_show record;
begin
  for v_show in
    select s.id
    from public.shows s
    where public.show_publication_enabled(
      s.id,
      'results'
    )
  loop
    perform public.refresh_show_results(
      v_show.id
    );
  end loop;
end;
$$;


-- ============================================================
-- 17. KEEP EDITION STATUS DERIVED FROM SHOW PUBLICATION
-- ============================================================

create or replace function public.sync_one_edition_publication(
  p_edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and not public.has_role(
      auth.uid(),
      'organizer'::public.app_role
    )
  then
    raise exception 'Only organizers can sync edition publication.'
      using errcode = '42501';
  end if;

  update public.editions e
  set
    published = exists (
      select 1
      from public.shows s
      where s.edition_id = p_edition_id
        and s.published = true
        and (
s.publication_config ->> 'participants' = 'true'
          or s.publication_config ->> 'artists' = 'true'
          or s.publication_config ->> 'songs' = 'true'
          or s.publication_config ->> 'semi_split' = 'true'
          or s.publication_config ->> 'running_order' = 'true'
          or s.publication_config ->> 'qualifiers' = 'true'
          or s.publication_config ->> 'results' = 'true'
          or s.publication_config ->> 'jury_results' = 'true'
          or s.publication_config ->> 'televote_results' = 'true'
          or s.publication_config ->> 'detailed_voting' = 'true'
        )
    ),
    status = case
      when exists (
        select 1
        from public.shows s
        where s.edition_id = p_edition_id
          and s.published = true
          and s.kind in ('grand-final', 'final')
          and s.publication_config ->> 'results' = 'true'
      )
        then 'completed'
      when exists (
        select 1
        from public.shows s
        where s.edition_id = p_edition_id
          and s.published = true
          and (
s.publication_config ->> 'participants' = 'true'
            or s.publication_config ->> 'artists' = 'true'
            or s.publication_config ->> 'songs' = 'true'
            or s.publication_config ->> 'semi_split' = 'true'
            or s.publication_config ->> 'running_order' = 'true'
            or s.publication_config ->> 'qualifiers' = 'true'
            or s.publication_config ->> 'results' = 'true'
            or s.publication_config ->> 'jury_results' = 'true'
            or s.publication_config ->> 'televote_results' = 'true'
            or s.publication_config ->> 'detailed_voting' = 'true'
          )
      )
        then 'published'
      else 'draft'
    end
  where e.id = p_edition_id;
end;
$$;

create or replace function public.sync_edition_publication_after_show_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
  end if;

  if v_old_edition is not null then
    perform public.sync_one_edition_publication(
      v_old_edition
    );
  end if;

  if v_new_edition is not null
    and v_new_edition is distinct from v_old_edition
  then
    perform public.sync_one_edition_publication(
      v_new_edition
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_edition_publication_after_show_change
on public.shows;

create trigger trg_sync_edition_publication_after_show_change
after insert or delete or update of published, publication_config, kind, edition_id
on public.shows
for each row
execute function public.sync_edition_publication_after_show_change();

-- Re-run once at migration end so the database starts internally
-- consistent even if this migration repaired legacy rows above.
do $$
declare
  v_edition record;
begin
  for v_edition in
    select id
    from public.editions
  loop
    perform public.sync_one_edition_publication(
      v_edition.id
    );
  end loop;
end;
$$;


revoke all
on function public.sync_one_edition_publication(uuid)
from public;

grant execute
on function public.sync_one_edition_publication(uuid)
to authenticated, service_role;

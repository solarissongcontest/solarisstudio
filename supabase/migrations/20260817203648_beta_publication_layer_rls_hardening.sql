-- Restore the publication-layer visibility helper and the intended public RLS rules.
-- This is a focused replay of the visibility portions of
-- 20260812003000_unify_publication_visibility.sql. It does not rewrite data.

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

revoke all on function public.show_publication_enabled(uuid, text) from public;
grant execute on function public.show_publication_enabled(uuid, text) to anon, authenticated, service_role;

drop policy if exists "participants public read" on public.participants;
drop policy if exists "participants public read published" on public.participants;
drop policy if exists "participants public read by publication" on public.participants;
create policy "participants public read by publication"
on public.participants for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'participants'))
  or (
    show_id is null
    and exists (select 1 from public.editions e where e.id = participants.edition_id and e.published = true)
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "results public read" on public.results;
drop policy if exists "results public read published" on public.results;
drop policy if exists "results public read by publication" on public.results;
create policy "results public read by publication"
on public.results for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'results'))
  or (
    show_id is null
    and exists (select 1 from public.editions e where e.id = results.edition_id and e.published = true)
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "jury public read" on public.jury_votes;
drop policy if exists "jury public read published" on public.jury_votes;
drop policy if exists "jury public read detailed only" on public.jury_votes;
create policy "jury public read detailed only"
on public.jury_votes for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (select 1 from public.editions e where e.id = jury_votes.edition_id and e.published = true)
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "televote public read" on public.televote_votes;
drop policy if exists "televote public read published" on public.televote_votes;
drop policy if exists "televote public read detailed only" on public.televote_votes;
create policy "televote public read detailed only"
on public.televote_votes for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (select 1 from public.editions e where e.id = televote_votes.edition_id and e.published = true)
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "voters public read" on public.voters;
drop policy if exists "voters public read published" on public.voters;
drop policy if exists "voters public read detailed only" on public.voters;
create policy "voters public read detailed only"
on public.voters for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (select 1 from public.editions e where e.id = voters.edition_id and e.published = true)
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "contest entities public read published" on public.contest_entities;
drop policy if exists "contest entities public read by participants" on public.contest_entities;
create policy "contest entities public read by participants"
on public.contest_entities for select
using (
  exists (
    select 1
    from public.participants p
    where p.edition_id = contest_entities.edition_id
      and (
        p.contest_entity_id = contest_entities.id
        or (contest_entities.country_id is not null and p.country_id = contest_entities.country_id)
      )
      and (
        (p.show_id is not null and public.show_publication_enabled(p.show_id, 'participants'))
        or (
          p.show_id is null
          and exists (select 1 from public.editions e where e.id = p.edition_id and e.published = true)
        )
      )
  )
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

drop policy if exists "themes public read" on public.themes;
create policy "themes public read"
on public.themes for select
using (
  is_public
  or exists (select 1 from public.shows s where s.theme_id = themes.id and s.published = true)
  or exists (select 1 from public.editions e where e.theme_id = themes.id and e.published = true)
  or public.has_role(auth.uid(), 'organizer'::public.app_role)
);

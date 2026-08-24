begin;

-- Custom edition-only countries are represented by contest_entities and have no
-- global country_id. Keep jury identity canonical across both global countries
-- and custom contest entities so automatic participant rosters can save their
-- ballots just like explicit voter rows can.
alter table public.jury_votes
  drop constraint if exists jury_votes_voter_identity_check;

alter table public.jury_votes
  add constraint jury_votes_voter_identity_check
  check (
    voter_id is not null
    or voter_country_id is not null
    or voter_entity_id is not null
  );

-- Production had drifted back to the older country-only uniqueness indexes.
-- Rebuild them around the canonical voter/recipient identity so custom entities
-- can both vote and receive votes without weakening duplicate protection.
drop index if exists public.jury_votes_show_voter_recipient_key;
drop index if exists public.jury_votes_show_voter_points_key;
drop index if exists public.jury_votes_show_voter_entity_key;
drop index if exists public.jury_votes_edition_voter_recipient_key;
drop index if exists public.jury_votes_edition_voter_points_key;

create unique index jury_votes_show_voter_recipient_key
  on public.jury_votes (
    show_id,
    coalesce(voter_id, voter_entity_id, voter_country_id),
    coalesce(receiving_entity_id, receiving_country_id)
  )
  where show_id is not null;

create unique index jury_votes_show_voter_points_key
  on public.jury_votes (
    show_id,
    coalesce(voter_id, voter_entity_id, voter_country_id),
    points
  )
  where show_id is not null;

create unique index jury_votes_edition_voter_recipient_key
  on public.jury_votes (
    edition_id,
    coalesce(voter_id, voter_entity_id, voter_country_id),
    coalesce(receiving_entity_id, receiving_country_id)
  )
  where show_id is null;

create unique index jury_votes_edition_voter_points_key
  on public.jury_votes (
    edition_id,
    coalesce(voter_id, voter_entity_id, voter_country_id),
    points
  )
  where show_id is null;

notify pgrst, 'reload schema';

commit;

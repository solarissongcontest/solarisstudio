begin;

-- ============================================================
-- PROTECT HISTORICAL JURY BALLOTS
--
-- A voter is an editable admin object, but jury_votes are historical
-- contest records. Deleting/recreating a voter must never silently
-- cascade into deleting a completed ballot.
-- ============================================================

alter table public.jury_votes
  drop constraint if exists jury_votes_voter_id_fkey;

alter table public.jury_votes
  add constraint jury_votes_voter_id_fkey
  foreign key (voter_id)
  references public.voters(id)
  on delete restrict;

comment on constraint jury_votes_voter_id_fkey on public.jury_votes is
  'Protects historical jury ballots. A voter with stored jury votes cannot be deleted.';

commit;

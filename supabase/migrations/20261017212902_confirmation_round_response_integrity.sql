begin;

-- Confirmation responses are historical contest records. Deleting a submission
-- round must never be able to erase responses through the foreign-key cascade.
-- Organizer already blocks deletion of rounds that contain responses; make the
-- database enforce the same invariant even for privileged/internal callers.

alter table public.submissions
  drop constraint if exists submissions_round_id_fkey;

alter table public.submissions
  add constraint submissions_round_id_fkey
  foreign key (round_id)
  references public.submission_rounds(id)
  on delete restrict;

commit;

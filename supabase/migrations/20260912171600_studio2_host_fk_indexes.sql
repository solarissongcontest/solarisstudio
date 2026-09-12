begin;

-- Phase 11 FK hardening. The (edition_id, bid_id) composite index is useful for
-- edition-scoped reads but cannot support the bid_id foreign key efficiently on
-- its own because bid_id is not the leading column.
create index if not exists studio2_host_bid_evaluations_bid_idx
  on public.studio2_host_bid_evaluations (bid_id);

commit;

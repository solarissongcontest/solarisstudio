begin;

-- V3 S16 cutover: the Organizer client now uses
-- public.studio2_apply_jury_vote_change with scoped authorization, CAS,
-- semantic idempotency and durable operation readback. The historical helpers
-- remain owner-only implementation primitives so existing validated SQL logic
-- is reused inside the canonical transaction, but no API role can invoke them.

revoke all on function public.assign_jury_vote(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.assign_jury_vote(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) to postgres;

revoke all on function public.clear_jury_point(
  uuid, uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.clear_jury_point(
  uuid, uuid, uuid, uuid, uuid, integer
) to postgres;

comment on function public.assign_jury_vote(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) is
  'Owner-only jury score primitive. External callers must use studio2_apply_jury_vote_change.';

comment on function public.clear_jury_point(
  uuid, uuid, uuid, uuid, uuid, integer
) is
  'Owner-only jury score primitive. External callers must use studio2_apply_jury_vote_change.';

notify pgrst, 'reload schema';

commit;

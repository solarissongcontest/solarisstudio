begin;

-- CREATE OR REPLACE preserves existing grants in PostgreSQL, but keep the
-- public RPC contract explicit in repository history so a future recreation
-- cannot accidentally make the Anniversary Engine organizer-only.
revoke all on function public.studio2_anniversary_engine(date, integer) from public;
grant execute on function public.studio2_anniversary_engine(date, integer) to anon, authenticated, service_role;

commit;

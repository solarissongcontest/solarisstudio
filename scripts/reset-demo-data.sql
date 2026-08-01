-- DEVELOPMENT ONLY — DO NOT RUN AGAINST PRODUCTION.
--
-- Clears all contest data (editions, shows, participants, votes, results) so a
-- development environment can be re-seeded from scratch. Countries, themes,
-- voters and user roles are left untouched.
--
-- This logic used to live inside a schema migration, which meant replaying the
-- migration chain in a fresh or restored environment silently erased real data.
-- It is intentionally kept out of supabase/migrations/ for that reason.
--
-- Safety guard: refuses to run unless the caller explicitly opts in with
--   SET LOCAL solaris.allow_demo_reset = 'yes';
DO $$
BEGIN
  IF current_setting('solaris.allow_demo_reset', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Refusing to reset contest data. Set solaris.allow_demo_reset = ''yes'' first (development only).';
  END IF;

  DELETE FROM public.results;
  DELETE FROM public.jury_votes;
  DELETE FROM public.televote_votes;
  DELETE FROM public.participants;
  DELETE FROM public.voters;
  DELETE FROM public.shows;
  DELETE FROM public.editions;
END $$;

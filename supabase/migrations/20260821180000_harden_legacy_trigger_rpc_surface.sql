-- Security cleanup discovered during the Beta 2 release audit.
-- These are trigger-only helpers. They should be executable by PostgreSQL when
-- their triggers fire, not exposed as browser RPCs.
--
-- Historical deployments may already contain one or more of these helpers,
-- while a clean replay can legitimately reach this migration without them.
-- Guard the REVOKEs so the migration remains safe in both histories.

do $$
begin
  if to_regprocedure('public.ensure_submission_recovery_code()') is not null then
    execute 'revoke all on function public.ensure_submission_recovery_code() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.register_submission_browser()') is not null then
    execute 'revoke all on function public.register_submission_browser() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.sync_round_stats()') is not null then
    execute 'revoke all on function public.sync_round_stats() from public, anon, authenticated';
  end if;
end
$$;

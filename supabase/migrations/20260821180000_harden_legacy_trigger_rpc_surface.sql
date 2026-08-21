-- Security cleanup discovered during the Beta 2 release audit.
-- These are trigger-only helpers. They should be executable by PostgreSQL when
-- their triggers fire, not exposed as browser RPCs.

revoke all on function public.ensure_submission_recovery_code() from public, anon, authenticated;
revoke all on function public.register_submission_browser() from public, anon, authenticated;
revoke all on function public.sync_round_stats() from public, anon, authenticated;

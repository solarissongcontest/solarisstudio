-- Beta 2 security follow-up: trigger helpers are internal database machinery,
-- not browser-callable RPCs. PostgreSQL grants EXECUTE on new functions to
-- PUBLIC by default, so revoke it explicitly after creating the triggers.

revoke all on function public.national_final_pulse_trigger() from public, anon, authenticated;
revoke all on function public.national_final_entry_pulse_trigger() from public, anon, authenticated;

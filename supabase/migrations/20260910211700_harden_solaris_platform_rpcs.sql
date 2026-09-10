-- Match Solaris' existing organizer-RPC hardening pattern: public/anon callers
-- should not receive EXECUTE merely because PostgreSQL grants it by default.

revoke all on function public.has_platform_capability(uuid, text, uuid) from public, anon;
revoke all on function public.platform_feature_enabled(text, uuid) from public, anon;
revoke all on function public.initialize_edition_runtime_state(uuid, text, text) from public, anon;
revoke all on function public.transition_edition_runtime_state(uuid, text, text) from public, anon;
revoke all on function public.update_edition_subsystem_state(uuid, text, text, text) from public, anon;

grant execute on function public.has_platform_capability(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.platform_feature_enabled(text, uuid) to authenticated, service_role;
grant execute on function public.initialize_edition_runtime_state(uuid, text, text) to authenticated;
grant execute on function public.transition_edition_runtime_state(uuid, text, text) to authenticated;
grant execute on function public.update_edition_subsystem_state(uuid, text, text, text) to authenticated;

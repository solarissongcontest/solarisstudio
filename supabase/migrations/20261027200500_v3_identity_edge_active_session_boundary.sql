begin;

select public.v3_register_migration_contract(
  'v3.identity.edge-active-session-boundary',
  1,
  'forward_fix_only',
  false,
  null,
  'Expose a narrow authenticated RPC that reuses the canonical auth.sessions guard so Edge Functions cannot turn a revoked-but-unexpired JWT into service-role identity authority.'
);

-- Supabase access JWTs can remain cryptographically valid until exp after the
-- backing session is signed out or revoked. Edge Functions that later switch to
-- service_role therefore need an explicit live-session proof, not just getUser.
-- This wrapper deliberately reuses Chat 1's canonical session authority rather
-- than creating a second identity/session model.
create or replace function public.v3_assert_active_session()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $active$
begin
  perform private.v3_require_active_auth_session();
  return true;
end
$active$;

revoke all on function public.v3_assert_active_session()
  from public, anon, service_role;
grant execute on function public.v3_assert_active_session()
  to authenticated;

comment on function public.v3_assert_active_session() is
  'Identity boundary probe for authenticated Edge/server callers. Returns true only while the signed JWT session_id still exists for auth.uid() in canonical auth.sessions. Does not grant application authorization.';

notify pgrst, 'reload schema';
commit;

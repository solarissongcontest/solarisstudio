begin;
select public.v3_register_migration_contract(
  'v3.session.readonly-admission', 1, 'forward_fix_only', false, null,
  'Validate canonical live-session ownership on read-only Data API requests without an illegal row lock; retain KEY SHARE admission for writable transactions so revocation serializes with protected mutations. Prove ordinary GET denial after canonical revocation and the existing writable admission race.'
);
create or replace function private.v3_require_active_auth_session()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, auth, public, private
as $active$
declare
  v_actor uuid := auth.uid();
  v_claim text := nullif(auth.jwt() ->> 'session_id', '');
  v_claimed_session uuid;
  v_locked_session uuid;
begin
  if v_actor is null or v_claim is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  begin
    v_claimed_session := v_claim::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end;

  if current_setting('transaction_read_only')::boolean then
    -- PostgreSQL forbids row locks on PostgREST GET transactions. These
    -- transactions cannot mutate canonical state. Validate the same session
    -- predicate synchronously; a request admitted before revocation may finish
    -- its read, and every request after the revocation commit fails closed.
    select session_row.id into v_locked_session
    from auth.sessions session_row
    where session_row.id = v_claimed_session
      and session_row.user_id = v_actor
      and (session_row.not_after is null or session_row.not_after > now());
  else
    select session_row.id into v_locked_session
    from auth.sessions session_row
    where session_row.id = v_claimed_session
      and session_row.user_id = v_actor
      and (session_row.not_after is null or session_row.not_after > now())
    for key share;
  end if;
  if v_locked_session is null then
    raise exception using errcode = '42501', message = 'SESSION_REVOKED', hint = 'Sign in again to continue.';
  end if;
  return v_locked_session;
end
$active$;
revoke all on function private.v3_require_active_auth_session()
  from public, anon, authenticated;
comment on function private.v3_require_active_auth_session() is
  'Canonical session admission: synchronous live-session validation for read-only requests; KEY SHARE admission serializes protected writable transactions with canonical revocation.';
notify pgrst, 'reload schema';
commit;

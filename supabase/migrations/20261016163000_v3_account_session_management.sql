begin;

-- Solaris Studio V3 System contract P42: authenticated Devices & sessions.
-- Session truth remains in Supabase Auth. Browser roles receive only a privacy-safe
-- current-user projection and can revoke only their own non-current sessions.

create table if not exists public.studio2_account_session_revocations (
  auth_session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_handle text not null,
  operation_id uuid references public.studio2_operation_receipts(operation_id) on delete set null,
  revoked_by_session_id uuid,
  revoked_at timestamptz not null default now(),
  reason text not null default 'user_revoked'
    check (reason in ('user_revoked', 'reconciled')),
  constraint studio2_account_session_revocations_handle_check
    check (session_handle ~ '^[0-9a-f]{64}$'),
  unique (user_id, session_handle)
);

create index if not exists studio2_account_session_revocations_user_time_idx
  on public.studio2_account_session_revocations (user_id, revoked_at desc);

alter table public.studio2_account_session_revocations enable row level security;
revoke all on table public.studio2_account_session_revocations
  from public, anon, authenticated;
grant all on table public.studio2_account_session_revocations to service_role;

create or replace function private.v3_session_handle(
  p_user_id uuid,
  p_session_id uuid
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, extensions
as $handle$
  select encode(
    extensions.digest(
      convert_to(p_user_id::text || ':' || p_session_id::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$handle$;

revoke all on function private.v3_session_handle(uuid, uuid)
  from public, anon, authenticated;

-- Strong session-state guard for security-sensitive V3 endpoints. Supabase access
-- JWTs can outlive a revoked Auth session, so this verifies the signed session_id
-- claim against auth.sessions instead of trusting token age alone.
create or replace function private.v3_require_active_auth_session()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, auth, public, private
as $active$
declare
  v_actor uuid := auth.uid();
  v_claim text := nullif(auth.jwt() ->> 'session_id', '');
  v_session_id uuid;
begin
  if v_actor is null or v_claim is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  begin
    v_session_id := v_claim::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end;

  if not exists (
    select 1
    from auth.sessions session_row
    where session_row.id = v_session_id
      and session_row.user_id = v_actor
      and (session_row.not_after is null or session_row.not_after > now())
  ) then
    raise exception using
      errcode = '42501',
      message = 'SESSION_REVOKED',
      hint = 'Sign in again to continue.';
  end if;

  return v_session_id;
end
$active$;

revoke all on function private.v3_require_active_auth_session()
  from public, anon, authenticated;

-- Fold active-session validation into the existing R3 fresh-auth boundary so a
-- revoked-but-unexpired JWT cannot continue performing high-risk V3 commands.
create or replace function private.studio2_require_fresh_auth(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $require_fresh$
declare
  v_session_id uuid;
  v_evidence jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();
  v_evidence := private.studio2_auth_freshness_evidence(p_max_age_seconds);

  if not coalesce((v_evidence ->> 'fresh')::boolean, false) then
    raise exception 'Fresh authentication required for this R3 operation'
      using errcode = '42501',
            hint = 'Re-enter your Solaris account password, then retry the exact reviewed operation.';
  end if;

  if v_evidence ->> 'sessionId' is distinct from v_session_id::text then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  return v_evidence;
end
$require_fresh$;

revoke all on function private.studio2_require_fresh_auth(integer)
  from public, anon, authenticated;

create or replace function public.studio2_r3_auth_status(
  p_max_age_seconds integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $status$
declare
  v_session_id uuid;
  v_evidence jsonb;
begin
  v_session_id := private.v3_require_active_auth_session();
  v_evidence := private.studio2_auth_freshness_evidence(p_max_age_seconds);

  if v_evidence ->> 'sessionId' is distinct from v_session_id::text then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  return v_evidence;
end
$status$;

revoke all on function public.studio2_r3_auth_status(integer)
  from public, anon;
grant execute on function public.studio2_r3_auth_status(integer)
  to authenticated, service_role;

create or replace function private.v3_session_client_label(p_user_agent text)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $label$
  select jsonb_build_object(
    'device', case
      when coalesce(p_user_agent, '') ilike '%iPhone%' then 'iPhone'
      when coalesce(p_user_agent, '') ilike '%iPad%' then 'iPad'
      when coalesce(p_user_agent, '') ilike '%Android%' then 'Android device'
      when coalesce(p_user_agent, '') ilike '%Macintosh%'
        or coalesce(p_user_agent, '') ilike '%Mac OS X%' then 'Mac'
      when coalesce(p_user_agent, '') ilike '%Windows%' then 'Windows device'
      when coalesce(p_user_agent, '') ilike '%Linux%' then 'Linux device'
      else 'Unknown device'
    end,
    'browser', case
      when coalesce(p_user_agent, '') ilike '%Edg/%'
        or coalesce(p_user_agent, '') ilike '%EdgiOS%'
        or coalesce(p_user_agent, '') ilike '%EdgA%' then 'Edge'
      when coalesce(p_user_agent, '') ilike '%Firefox/%'
        or coalesce(p_user_agent, '') ilike '%FxiOS%' then 'Firefox'
      when coalesce(p_user_agent, '') ilike '%Chrome/%'
        or coalesce(p_user_agent, '') ilike '%CriOS%' then 'Chrome'
      when coalesce(p_user_agent, '') ilike '%Safari/%' then 'Safari'
      else 'Other browser'
    end
  );
$label$;

revoke all on function private.v3_session_client_label(text)
  from public, anon, authenticated;

create or replace function public.v3_my_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $projection$
declare
  v_actor uuid := auth.uid();
  v_current_session uuid;
  v_freshness jsonb;
  v_sessions jsonb;
  v_history jsonb;
begin
  v_current_session := private.v3_require_active_auth_session();
  v_freshness := private.studio2_auth_freshness_evidence(300) - 'sessionId';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sessionHandle', private.v3_session_handle(v_actor, session_row.id),
        'current', session_row.id = v_current_session,
        'createdAt', date_trunc('minute', session_row.created_at),
        'lastActiveAt', date_trunc(
          'minute',
          greatest(
            session_row.created_at,
            session_row.updated_at,
            session_row.refreshed_at at time zone 'UTC'
          )
        ),
        'expiresAt', session_row.not_after,
        'client', private.v3_session_client_label(session_row.user_agent),
        'assurance', jsonb_build_object(
          'aal', coalesce(session_row.aal::text, 'aal1'),
          'freshAuth', case
            when session_row.id = v_current_session then v_freshness
            else null
          end
        )
      )
      order by
        (session_row.id = v_current_session) desc,
        greatest(
          session_row.created_at,
          session_row.updated_at,
          session_row.refreshed_at at time zone 'UTC'
        ) desc,
        session_row.id
    ),
    '[]'::jsonb
  )
  into v_sessions
  from auth.sessions session_row
  where session_row.user_id = v_actor
    and (session_row.not_after is null or session_row.not_after > now());

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'type', 'session_revoked',
        'sessionHandle', history_row.session_handle,
        'occurredAt', date_trunc('minute', history_row.revoked_at)
      )
      order by history_row.revoked_at desc, history_row.session_handle
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select revocation.session_handle, revocation.revoked_at
    from public.studio2_account_session_revocations revocation
    where revocation.user_id = v_actor
    order by revocation.revoked_at desc, revocation.session_handle
    limit 20
  ) history_row;

  return jsonb_build_object(
    'sessions', v_sessions,
    'securityHistory', v_history,
    'serverTime', now()
  );
end
$projection$;

revoke all on function public.v3_my_sessions()
  from public, anon;
grant execute on function public.v3_my_sessions()
  to authenticated;

comment on function public.v3_my_sessions() is
  'Privacy-safe current-user Auth session projection. Raw Auth session ids, user agents, IP addresses and tokens are never returned.';

-- Session revocation is a security recovery command and must remain available
-- while normal product mutations are suppressed in Read-only/Maintenance.
create or replace function private.studio2_platform_mutation_allowed(
  p_command text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select coalesce(
    (
      select case state.mode
        when 'normal' then true
        when 'degraded' then true
        when 'read_only' then coalesce(p_command, '') in (
          'system.platform_mode.change',
          'system.push.retry_failed',
          'account.session.revoke'
        )
        when 'maintenance' then coalesce(p_command, '') in (
          'system.platform_mode.change',
          'account.session.revoke'
        )
        else false
      end
      from public.studio2_platform_operational_state state
      where state.singleton = true
    ),
    false
  );
$allowed$;

revoke all on function private.studio2_platform_mutation_allowed(text)
  from public, anon, authenticated;

create or replace function public.v3_revoke_session(
  p_session_handle text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $revoke$
declare
  v_actor uuid := auth.uid();
  v_current_session uuid;
  v_current_handle text;
  v_target_session uuid;
  v_tombstone public.studio2_account_session_revocations;
  v_existing public.studio2_operation_receipts;
  v_evidence jsonb;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
  v_handle text := lower(btrim(coalesce(p_session_handle, '')));
begin
  v_current_session := private.v3_require_active_auth_session();
  v_current_handle := private.v3_session_handle(v_actor, v_current_session);

  if v_handle !~ '^[0-9a-f]{64}$'
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_handle = v_current_handle then
    raise exception using
      errcode = '42501',
      message = 'AUTHORIZATION',
      hint = 'Use the canonical current-session sign-out flow.';
  end if;

  -- Exact succeeded retries reconcile before requiring another fresh-auth step.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'account.session.revoke'
    and receipt.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return coalesce(v_existing.result, '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;

  select session_row.id
  into v_target_session
  from auth.sessions session_row
  where session_row.user_id = v_actor
    and private.v3_session_handle(v_actor, session_row.id) = v_handle
    and session_row.id <> v_current_session
  for update;

  if v_target_session is null then
    select revocation.*
    into v_tombstone
    from public.studio2_account_session_revocations revocation
    where revocation.user_id = v_actor
      and revocation.session_handle = v_handle
    limit 1;

    if v_tombstone.auth_session_id is null then
      -- Same response for another user's handle and a nonexistent handle: no probe.
      raise exception using errcode = 'P0002', message = 'UNKNOWN';
    end if;
  end if;

  if v_target_session is not null then
    v_evidence := private.studio2_require_fresh_auth(300);
  else
    v_evidence := private.studio2_auth_freshness_evidence(300);
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'account.session.revoke',
    'R3',
    jsonb_build_object('sessionHandle', v_handle),
    jsonb_build_object('sessionHandle', v_handle)
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'correlationId', v_claim ->> 'correlationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_target_session is null then
    v_result := jsonb_build_object(
      'ok', true,
      'sessionHandle', v_handle,
      'alreadyRevoked', true,
      'revokedAt', v_tombstone.revoked_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  else
    insert into public.studio2_account_session_revocations (
      auth_session_id,
      user_id,
      session_handle,
      operation_id,
      revoked_by_session_id,
      revoked_at,
      reason
    )
    values (
      v_target_session,
      v_actor,
      v_handle,
      v_canonical_operation_id,
      v_current_session,
      now(),
      'user_revoked'
    )
    on conflict (auth_session_id) do update set
      operation_id = coalesce(public.studio2_account_session_revocations.operation_id, excluded.operation_id),
      revoked_by_session_id = excluded.revoked_by_session_id,
      revoked_at = least(public.studio2_account_session_revocations.revoked_at, excluded.revoked_at);

    delete from auth.sessions session_row
    where session_row.id = v_target_session
      and session_row.user_id = v_actor;

    select revocation.*
    into v_tombstone
    from public.studio2_account_session_revocations revocation
    where revocation.auth_session_id = v_target_session;

    v_result := jsonb_build_object(
      'ok', true,
      'sessionHandle', v_handle,
      'alreadyRevoked', false,
      'revokedAt', v_tombstone.revoked_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false
    );
  end if;

  update public.studio2_operation_receipts
  set
    actor_session_id = v_current_session::text,
    auth_freshness_evidence = v_evidence,
    updated_at = now()
  where operation_id = v_canonical_operation_id
    and actor_id = v_actor;

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$revoke$;

revoke all on function public.v3_revoke_session(text, uuid, text)
  from public, anon;
grant execute on function public.v3_revoke_session(text, uuid, text)
  to authenticated;

comment on function public.v3_revoke_session(text, uuid, text) is
  'Fresh-authenticated idempotent revocation of one non-current session owned by the current user. The browser supplies only an opaque scoped session handle.';

notify pgrst, 'reload schema';

commit;

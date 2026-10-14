-- V3 Televote recovery continuity
--
-- Preserve the existing preflight token as the only bearer capability that can
-- submit a ballot.  This migration adds a separate, lower-privilege recovery
-- capability that can only read the authoritative receipt bound to one
-- preflight.  The recovery secret is stored hashed and the RPCs are service
-- role only; browsers reach them through rate-limited server functions.

create table if not exists private.v3_televote_recovery_handles (
  operation_id uuid primary key,
  preflight_id uuid not null unique references televoting.vote_preflight_checks(id) on delete cascade,
  recovery_secret_hash text not null,
  created_at timestamptz not null default now(),
  constraint v3_televote_recovery_secret_hash_shape
    check (recovery_secret_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.v3_televote_recovery_handles is
  'Read-only V3 Televote receipt recovery capabilities. Plaintext recovery secrets are never stored.';

revoke all on table private.v3_televote_recovery_handles from public, anon, authenticated;

create index if not exists v3_televote_recovery_handles_preflight_idx
  on private.v3_televote_recovery_handles(preflight_id);

create or replace function public.v3_create_televote_recovery_handle(
  p_preflight_token uuid
)
returns table (
  operation_id uuid,
  recovery_secret text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $$
declare
  v_operation_id uuid;
  v_recovery_secret text;
begin
  if p_preflight_token is null then
    raise exception 'Preflight token is required';
  end if;

  if not exists (
    select 1
    from televoting.vote_preflight_checks p
    where p.id = p_preflight_token
  ) then
    raise exception 'Voting preflight not found';
  end if;

  -- A preflight gets exactly one recovery capability.  If the server loses the
  -- response to this creation call, it must create a fresh preflight rather
  -- than attempting to recover plaintext from a stored hash.
  if exists (
    select 1
    from private.v3_televote_recovery_handles h
    where h.preflight_id = p_preflight_token
  ) then
    raise exception 'Voting recovery handle already exists';
  end if;

  v_operation_id := gen_random_uuid();
  v_recovery_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.v3_televote_recovery_handles (
    operation_id,
    preflight_id,
    recovery_secret_hash
  ) values (
    v_operation_id,
    p_preflight_token,
    encode(extensions.digest(v_recovery_secret, 'sha256'), 'hex')
  );

  return query
  select v_operation_id, v_recovery_secret;
end;
$$;

comment on function public.v3_create_televote_recovery_handle(uuid) is
  'Creates a read-only receipt recovery capability for one Televote preflight. Service-role only.';

revoke all on function public.v3_create_televote_recovery_handle(uuid) from public, anon, authenticated;
grant execute on function public.v3_create_televote_recovery_handle(uuid) to service_role;

create or replace function public.v3_reconcile_televote_recovery(
  p_operation_id uuid,
  p_recovery_secret text
)
returns table (
  found boolean,
  id uuid,
  round_id uuid,
  preflight_id uuid,
  status text,
  accepted_at timestamptz,
  authority text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $$
declare
  v_preflight_id uuid;
  v_preflight televoting.vote_preflight_checks%rowtype;
  v_submission televoting.vote_submissions%rowtype;
begin
  if p_operation_id is null
     or p_recovery_secret is null
     or length(p_recovery_secret) < 32
     or length(p_recovery_secret) > 256 then
    return query
    select false, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 'authoritative_server'::text;
    return;
  end if;

  select h.preflight_id
    into v_preflight_id
  from private.v3_televote_recovery_handles h
  where h.operation_id = p_operation_id
    and h.recovery_secret_hash = encode(extensions.digest(p_recovery_secret, 'sha256'), 'hex');

  if v_preflight_id is null then
    return query
    select false, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 'authoritative_server'::text;
    return;
  end if;

  select p.*
    into v_preflight
  from televoting.vote_preflight_checks p
  where p.id = v_preflight_id;

  if v_preflight.id is null
     or v_preflight.submission_id is null
     or v_preflight.submitted_at is null then
    return query
    select false, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 'authoritative_server'::text;
    return;
  end if;

  select s.*
    into v_submission
  from televoting.vote_submissions s
  where s.id = v_preflight.submission_id
    and s.round_id = v_preflight.round_id
    and s.status in ('active', 'suspicious', 'verified');

  if v_submission.id is null then
    return query
    select false, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, 'authoritative_server'::text;
    return;
  end if;

  return query
  select
    true,
    v_submission.id,
    v_submission.round_id,
    v_preflight.id,
    v_submission.status,
    coalesce(v_preflight.submitted_at, v_submission.created_at),
    'authoritative_server'::text;
end;
$$;

comment on function public.v3_reconcile_televote_recovery(uuid, text) is
  'Resolves a read-only Televote recovery capability to an authoritative accepted receipt. Service-role only.';

revoke all on function public.v3_reconcile_televote_recovery(uuid, text) from public, anon, authenticated;
grant execute on function public.v3_reconcile_televote_recovery(uuid, text) to service_role;

begin;

create table if not exists private.country_auth_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

comment on table private.country_auth_rate_limits is
  'Hashed, short-lived counters used by the public country-auth Edge Function. Raw IP addresses and login identifiers are deliberately not stored.';

revoke all on private.country_auth_rate_limits from public, anon, authenticated;

create or replace function public.country_auth_consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_now timestamptz := now();
  v_attempts integer;
  v_window_started_at timestamptz;
begin
  if p_scope is null or btrim(p_scope) = ''
    or p_key_hash is null or btrim(p_key_hash) = ''
    or p_limit < 1 or p_limit > 1000
    or p_window_seconds < 1 or p_window_seconds > 86400
  then
    raise exception 'Invalid rate-limit request' using errcode = '22023';
  end if;

  -- Keep the hashed limiter state genuinely short-lived. Each auth attempt
  -- removes a bounded batch of counters that are older than every supported
  -- rate-limit window, so identifier churn cannot grow this table forever.
  delete from private.country_auth_rate_limits stale
  where stale.ctid in (
    select candidate.ctid
    from private.country_auth_rate_limits candidate
    where candidate.updated_at < v_now - interval '2 days'
    order by candidate.updated_at
    limit 200
  );

  insert into private.country_auth_rate_limits (
    scope,
    key_hash,
    window_started_at,
    attempts,
    updated_at
  )
  values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when private.country_auth_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then v_now
      else private.country_auth_rate_limits.window_started_at
    end,
    attempts = case
      when private.country_auth_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then 1
      else private.country_auth_rate_limits.attempts + 1
    end,
    updated_at = v_now
  returning attempts, window_started_at
  into v_attempts, v_window_started_at;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  to service_role;

create index if not exists country_auth_rate_limits_updated_idx
  on private.country_auth_rate_limits(updated_at);

notify pgrst, 'reload schema';

commit;

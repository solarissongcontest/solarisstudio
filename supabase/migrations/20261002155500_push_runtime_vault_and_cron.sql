-- Keep installed-app Web Push runtime configuration in Supabase Vault and
-- dispatch queued notifications from Supabase itself. Public clients can read
-- only the VAPID public key; private material remains service-role only.

create extension if not exists pg_cron with schema extensions;

create or replace function public.solaris_web_push_public_key()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'solaris_web_push_public_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.solaris_web_push_public_key() from public;
grant execute on function public.solaris_web_push_public_key() to anon, authenticated;

create or replace function public.solaris_get_push_runtime_secrets()
returns table (
  dispatch_secret text,
  vapid_public_key text,
  vapid_private_key text,
  vapid_subject text
)
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select
    max(decrypted_secret) filter (where name = 'solaris_push_dispatch_secret') as dispatch_secret,
    max(decrypted_secret) filter (where name = 'solaris_web_push_public_key') as vapid_public_key,
    max(decrypted_secret) filter (where name = 'solaris_web_push_private_key') as vapid_private_key,
    coalesce(
      max(decrypted_secret) filter (where name = 'solaris_web_push_subject'),
      'mailto:notifications@solaris-song-contest.workers.dev'
    ) as vapid_subject
  from vault.decrypted_secrets
  where name in (
    'solaris_push_dispatch_secret',
    'solaris_web_push_public_key',
    'solaris_web_push_private_key',
    'solaris_web_push_subject'
  );
$$;

revoke all on function public.solaris_get_push_runtime_secrets() from public, anon, authenticated;
grant execute on function public.solaris_get_push_runtime_secrets() to service_role;

create or replace function public.solaris_dispatch_push_from_database()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_function_url text;
  v_dispatch_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_function_url
  from vault.decrypted_secrets
  where name = 'solaris_supabase_function_url'
  order by created_at desc
  limit 1;

  select decrypted_secret
  into v_dispatch_secret
  from vault.decrypted_secrets
  where name = 'solaris_push_dispatch_secret'
  order by created_at desc
  limit 1;

  if coalesce(v_function_url, '') = '' or coalesce(v_dispatch_secret, '') = '' then
    raise warning 'Solaris push dispatch skipped: Vault runtime configuration is incomplete.';
    return null;
  end if;

  select net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-solaris-push-secret', v_dispatch_secret
    ),
    body := jsonb_build_object('source', 'supabase-cron')
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.solaris_dispatch_push_from_database() from public, anon, authenticated;
grant execute on function public.solaris_dispatch_push_from_database() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'solaris-app-push-dispatch'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'solaris-app-push-dispatch',
    '*/5 * * * *',
    'select public.solaris_dispatch_push_from_database();'
  );
end
$$;

-- Confirmations project: xwvnrpuqehqcatowxfpx
-- Adds automatic confirmation editing for signed-in Solaris country accounts.

create or replace function public.solaris_request_country()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  request_headers jsonb;
  access_token text;
  response extensions.http_response;
  response_json jsonb;
  country_id uuid;
  country_json jsonb;
begin
  request_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  access_token := nullif(request_headers ->> 'x-solaris-access-token', '');

  if access_token is null then
    return null;
  end if;

  select *
  into response
  from extensions.http((
    'GET'::extensions.http_method,
    'https://oxtbskojiexkaspputvo.supabase.co/rest/v1/country_accounts?select=country_id,status&status=eq.active&limit=1'::varchar,
    array[
      extensions.http_header('apikey', 'sb_publishable_HlFRpOFUHzotkO609JPXgQ_ZWi8DSCj'),
      extensions.http_header('Authorization', 'Bearer ' || access_token),
      extensions.http_header('Accept', 'application/json')
    ]::extensions.http_header[],
    null::varchar,
    null::varchar
  )::extensions.http_request);

  if response.status <> 200 then
    return null;
  end if;

  response_json := coalesce(nullif(response.content, ''), '[]')::jsonb;
  if jsonb_typeof(response_json) <> 'array' or jsonb_array_length(response_json) = 0 then
    return null;
  end if;

  begin
    country_id := (response_json -> 0 ->> 'country_id')::uuid;
  exception
    when others then
      return null;
  end;

  select *
  into response
  from extensions.http((
    'GET'::extensions.http_method,
    ('https://oxtbskojiexkaspputvo.supabase.co/rest/v1/countries?select=id,name,short_code&id=eq.' || country_id::text || '&limit=1')::varchar,
    array[
      extensions.http_header('apikey', 'sb_publishable_HlFRpOFUHzotkO609JPXgQ_ZWi8DSCj'),
      extensions.http_header('Authorization', 'Bearer ' || access_token),
      extensions.http_header('Accept', 'application/json')
    ]::extensions.http_header[],
    null::varchar,
    null::varchar
  )::extensions.http_request);

  if response.status <> 200 then
    return null;
  end if;

  country_json := coalesce(nullif(response.content, ''), '[]')::jsonb;
  if jsonb_typeof(country_json) <> 'array' or jsonb_array_length(country_json) = 0 then
    return null;
  end if;

  return jsonb_build_object(
    'country_id', country_id,
    'name', country_json -> 0 ->> 'name',
    'short_code', country_json -> 0 ->> 'short_code'
  );
exception
  when others then
    return null;
end;
$function$;

revoke all on function public.solaris_request_country() from public, anon, authenticated;

create or replace function public.public_country_account_confirmation_access()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  country_info jsonb;
  country_name text;
  country_code text;
  responses jsonb;
begin
  country_info := public.solaris_request_country();

  if country_info is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  country_name := nullif(trim(country_info ->> 'name'), '');
  country_code := nullif(trim(country_info ->> 'short_code'), '');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'round_id', r.id,
        'round_name', r.name,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'country', s.country,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'can_edit',
          not coalesce(s.locked, false)
          and coalesce(s.editing_allowed, false)
          and coalesce(r.editing_enabled, false)
          and coalesce(e.editing_enabled, false),
        'reason',
          case
            when coalesce(s.locked, false) then 'locked'
            when not coalesce(s.editing_allowed, false)
              or not coalesce(r.editing_enabled, false)
              or not coalesce(e.editing_enabled, false) then 'editing_closed'
            else 'open'
          end
      )
      order by e.edition_number desc, s.submitted_at desc
    ),
    '[]'::jsonb
  )
  into responses
  from public.submissions s
  join public.submission_rounds r on r.id = s.round_id
  join public.editions e on e.id = r.edition_id
  where
    (country_name is not null and lower(trim(s.country)) = lower(country_name))
    or (country_code is not null and lower(trim(s.country)) = lower(country_code));

  return jsonb_build_object(
    'authenticated', true,
    'country', country_info,
    'responses', responses
  );
end;
$function$;

grant execute on function public.public_country_account_confirmation_access() to anon, authenticated;

create or replace function public.public_create_country_account_edit_token(_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  country_info jsonb;
  country_name text;
  country_code text;
  s public.submissions;
  r public.submission_rounds;
  e public.editions;
  raw_token text;
  token_hash text;
begin
  if _round_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_round');
  end if;

  country_info := public.solaris_request_country();
  if country_info is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  country_name := nullif(trim(country_info ->> 'name'), '');
  country_code := nullif(trim(country_info ->> 'short_code'), '');

  select submission.*
  into s
  from public.submissions submission
  where submission.round_id = _round_id
    and (
      (country_name is not null and lower(trim(submission.country)) = lower(country_name))
      or (country_code is not null and lower(trim(submission.country)) = lower(country_code))
    )
  order by submission.submitted_at desc
  limit 1
  for update;

  if s.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into r from public.submission_rounds where id = s.round_id;
  select * into e from public.editions where id = s.edition_id;

  if coalesce(s.locked, false) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if not coalesce(s.editing_allowed, false)
     or not coalesce(r.editing_enabled, false)
     or not coalesce(e.editing_enabled, false) then
    return jsonb_build_object('ok', false, 'reason', 'editing_closed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(s.id::text || ':country_account', 0));

  update public.edit_tokens
  set active = false
  where submission_id = s.id
    and token_type = 'country_account'
    and active = true;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  insert into public.edit_tokens (
    submission_id,
    token_hash,
    token_type,
    browser_session_id,
    active,
    created_at,
    expires_at,
    use_count
  ) values (
    s.id,
    token_hash,
    'country_account',
    null,
    true,
    now(),
    now() + interval '2 hours',
    0
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'submission_id', s.id,
    'country', s.country,
    'token', raw_token,
    'expires_at', now() + interval '2 hours'
  );
end;
$function$;

grant execute on function public.public_create_country_account_edit_token(uuid) to anon, authenticated;

-- Applied to the dedicated Confirmations Supabase project.
-- Fixes country-account identity resolution for Solaris users who also have the
-- organizer role. Organizer RLS can see every country_accounts row, so the old
-- `status=active&limit=1` lookup could return another organizer country.

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
  user_json jsonb;
  response_json jsonb;
  country_json jsonb;
  solaris_user_id uuid;
  country_id uuid;
begin
  request_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  access_token := nullif(request_headers ->> 'x-solaris-access-token', '');

  if access_token is null then
    return null;
  end if;

  -- Ask Solaris Auth who the bearer token actually belongs to. This keeps the
  -- lookup correct even when that user is an organizer and RLS permits them to
  -- read other country accounts.
  select *
  into response
  from extensions.http((
    'GET'::extensions.http_method,
    'https://oxtbskojiexkaspputvo.supabase.co/auth/v1/user'::varchar,
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

  user_json := coalesce(nullif(response.content, ''), '{}')::jsonb;
  begin
    solaris_user_id := nullif(user_json ->> 'id', '')::uuid;
  exception
    when others then
      return null;
  end;

  if solaris_user_id is null then
    return null;
  end if;

  select *
  into response
  from extensions.http((
    'GET'::extensions.http_method,
    format(
      'https://oxtbskojiexkaspputvo.supabase.co/rest/v1/country_accounts?select=country_id,status&user_id=eq.%s&status=eq.active&limit=1',
      solaris_user_id
    )::varchar,
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
    country_id := nullif(response_json -> 0 ->> 'country_id', '')::uuid;
  exception
    when others then
      return null;
  end;

  if country_id is null then
    return null;
  end if;

  select *
  into response
  from extensions.http((
    'GET'::extensions.http_method,
    format(
      'https://oxtbskojiexkaspputvo.supabase.co/rest/v1/countries?select=id,name,short_code&id=eq.%s&limit=1',
      country_id
    )::varchar,
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

-- National-Final winner syncing should use the same exact identity resolver so
-- this bug cannot reappear in a second copy of the lookup logic.
create or replace function public.solaris_request_country_identity()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  return public.solaris_request_country();
end;
$function$;

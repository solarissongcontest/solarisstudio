-- Applied to the dedicated Confirmations Supabase project.
-- Lets a signed-in Solaris country account write its own National Final winner
-- back to the original confirmation. Organizer accounts remain allowed too.

create or replace function public.solaris_request_country_identity()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  request_headers jsonb;
  access_token text;
  account_response extensions.http_response;
  country_response extensions.http_response;
  account_json jsonb;
  country_json jsonb;
  country_id uuid;
begin
  request_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  access_token := nullif(request_headers ->> 'x-solaris-access-token', '');

  if access_token is null then
    return null;
  end if;

  select *
  into account_response
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

  if account_response.status <> 200 then
    return null;
  end if;

  account_json := coalesce(nullif(account_response.content, ''), '[]')::jsonb;
  if jsonb_typeof(account_json) <> 'array' or jsonb_array_length(account_json) = 0 then
    return null;
  end if;

  country_id := nullif(account_json -> 0 ->> 'country_id', '')::uuid;
  if country_id is null then
    return null;
  end if;

  select *
  into country_response
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

  if country_response.status <> 200 then
    return null;
  end if;

  country_json := coalesce(nullif(country_response.content, ''), '[]')::jsonb;
  if jsonb_typeof(country_json) <> 'array' or jsonb_array_length(country_json) = 0 then
    return null;
  end if;

  return country_json -> 0;
exception
  when others then
    return null;
end;
$$;

create or replace function public.can_solaris_manage_confirmation_national_final(_national_final_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  identity jsonb;
  submission_country text;
begin
  if public.is_solaris_organizer_request() then
    return true;
  end if;

  identity := public.solaris_request_country_identity();
  if identity is null then
    return false;
  end if;

  select s.country
  into submission_country
  from public.national_finals nf
  join public.submissions s on s.id = nf.submission_id
  where nf.id = _national_final_id;

  if submission_country is null then
    return false;
  end if;

  return lower(trim(submission_country)) in (
    lower(trim(coalesce(identity ->> 'name', ''))),
    lower(trim(coalesce(identity ->> 'short_code', '')))
  );
exception
  when others then
    return false;
end;
$$;

create or replace function public.set_confirmation_national_final_winner_from_solaris(
  _national_final_id uuid,
  _winning_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nf public.national_finals;
  v_old_entry public.national_final_entries;
  v_new_entry public.national_final_entries;
begin
  if not public.can_solaris_manage_confirmation_national_final(_national_final_id) then
    raise exception 'You cannot edit this confirmation National Final.' using errcode='42501';
  end if;

  select * into v_nf
  from public.national_finals
  where id = _national_final_id;

  if v_nf.id is null then
    raise exception 'National Final not found.' using errcode='22023';
  end if;

  if v_nf.winning_entry_id is not null then
    select * into v_old_entry
    from public.national_final_entries
    where id = v_nf.winning_entry_id
      and national_final_id = v_nf.id;
  end if;

  if _winning_entry_id is not null then
    select * into v_new_entry
    from public.national_final_entries
    where id = _winning_entry_id
      and national_final_id = v_nf.id
      and coalesce(removed, false) = false
      and review_status = 'accepted';

    if v_new_entry.id is null then
      raise exception 'Winner must be an accepted active entry from this National Final.' using errcode='22023';
    end if;
  end if;

  update public.national_finals
  set winning_entry_id = _winning_entry_id
  where id = v_nf.id;

  if v_nf.winning_entry_id is distinct from _winning_entry_id then
    insert into public.submission_review_history(
      submission_id,
      target_type,
      target_entry_id,
      artist_snapshot,
      song_title_snapshot,
      action,
      reason,
      admin_user_id
    ) values (
      v_nf.submission_id,
      'national_final',
      coalesce(v_new_entry.id, v_old_entry.id),
      coalesce(v_new_entry.artist, v_old_entry.artist),
      coalesce(v_new_entry.song_title, v_old_entry.song_title),
      case when _winning_entry_id is null then 'winner_cleared' else 'winner_selected' end,
      'Winner synced from My Solaris',
      null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'national_final_id', v_nf.id,
    'submission_id', v_nf.submission_id,
    'winning_entry_id', _winning_entry_id
  );
end;
$$;

revoke all on function public.solaris_request_country_identity() from public, anon, authenticated;
revoke all on function public.can_solaris_manage_confirmation_national_final(uuid) from public, anon, authenticated;
revoke all on function public.set_confirmation_national_final_winner_from_solaris(uuid,uuid) from public;
grant execute on function public.set_confirmation_national_final_winner_from_solaris(uuid,uuid) to anon, authenticated;

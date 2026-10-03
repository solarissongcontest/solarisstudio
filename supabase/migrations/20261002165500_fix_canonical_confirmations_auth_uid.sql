begin;

-- Hotfix the canonical Confirmations country-account RPCs.
-- PL/pgSQL's CURRENT_USER keyword shadowed the first variable name, producing a
-- uuid = name comparison at runtime. Use an unambiguous auth.uid() variable.

create or replace function public.public_country_account_confirmation_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  responses jsonb;
begin
  if caller_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select ca.country_id
  into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id
    and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select c.*
  into country_row
  from public.countries c
  where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

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
        'selection_method', s.selection_method,
        'entry_unknown', s.entry_unknown,
        'reveal_date_type', s.reveal_date_type,
        'reveal_exact_date', s.reveal_exact_date,
        'reveal_approximate_text', s.reveal_approximate_text,
        'nf_date_type', s.nf_date_type,
        'nf_exact_date', s.nf_exact_date,
        'nf_result_date_type', s.nf_result_date_type,
        'nf_result_exact_date', s.nf_result_exact_date,
        'internal_entry', (
          select jsonb_build_object(
            'id', i.id,
            'artist', i.artist,
            'song_title', i.song_title,
            'review_status', coalesce(i.review_status, 'pending'),
            'review_reason', i.review_reason,
            'reviewed_at', i.reviewed_at
          )
          from public.internal_entries i
          where i.submission_id = s.id
          limit 1
        ),
        'national_final', (
          select jsonb_build_object(
            'id', nf.id,
            'nf_name', nf.nf_name,
            'winning_entry_id', nf.winning_entry_id,
            'entries', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', nfe.id,
                  'artist', nfe.artist,
                  'song_title', nfe.song_title,
                  'position', nfe.position,
                  'review_status', coalesce(nfe.review_status, 'pending'),
                  'review_reason', nfe.review_reason,
                  'reviewed_at', nfe.reviewed_at,
                  'removed', coalesce(nfe.removed, false)
                )
                order by nfe.position, nfe.id
              )
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ), '[]'::jsonb)
          )
          from public.national_finals nf
          where nf.submission_id = s.id
          limit 1
        ),
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
  where lower(trim(s.country)) in (
    lower(trim(country_row.name)),
    lower(trim(country_row.short_code))
  );

  return jsonb_build_object(
    'authenticated', true,
    'country', jsonb_build_object(
      'country_id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code
    ),
    'responses', responses
  );
end;
$$;

revoke all on function public.public_country_account_confirmation_access() from public;
grant execute on function public.public_country_account_confirmation_access() to anon, authenticated;

create or replace function public.public_create_country_account_edit_token(_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  submission_row public.submissions;
  round_row public.submission_rounds;
  edition_row public.editions;
  raw_token text;
  token_hash text;
begin
  if caller_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if _round_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_round');
  end if;

  select ca.country_id
  into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id
    and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select c.*
  into country_row
  from public.countries c
  where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select s.*
  into submission_row
  from public.submissions s
  where s.round_id = _round_id
    and lower(trim(s.country)) in (
      lower(trim(country_row.name)),
      lower(trim(country_row.short_code))
    )
  order by s.submitted_at desc
  limit 1
  for update;

  if submission_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into round_row
  from public.submission_rounds
  where id = submission_row.round_id;

  select * into edition_row
  from public.editions
  where id = submission_row.edition_id;

  if coalesce(submission_row.locked, false) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if not coalesce(submission_row.editing_allowed, false)
     or not coalesce(round_row.editing_enabled, false)
     or not coalesce(edition_row.editing_enabled, false) then
    return jsonb_build_object('ok', false, 'reason', 'editing_closed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(submission_row.id::text || ':country_account', 0)
  );

  update public.edit_tokens
  set active = false
  where submission_id = submission_row.id
    and token_type = 'country_account'
    and active = true;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  token_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  insert into public.edit_tokens (
    submission_id,
    token_hash,
    token_type,
    active,
    created_at,
    expires_at,
    use_count
  ) values (
    submission_row.id,
    token_hash,
    'country_account',
    true,
    now(),
    now() + interval '2 hours',
    0
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'submission_id', submission_row.id,
    'country', submission_row.country,
    'token', raw_token,
    'expires_at', now() + interval '2 hours'
  );
end;
$$;

revoke all on function public.public_create_country_account_edit_token(uuid) from public;
grant execute on function public.public_create_country_account_edit_token(uuid) to authenticated;

commit;

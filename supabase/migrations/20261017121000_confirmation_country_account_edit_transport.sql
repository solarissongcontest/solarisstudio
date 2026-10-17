begin;

-- The emergency Confirmation maintenance slice must not clone or fork the
-- canonical V3 writer. The immediately preceding hotfix was authored against
-- the production definition, while main already contains the newer Entry
-- credits extension. Restore that canonical main definition here, then add a
-- narrow country-account command around it. Future Confirmation writer changes
-- therefore continue to have one owner.
create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $submit$
declare
  v_round_id uuid;
  v_request_hash text;
  v_payload_session text;
  v_payload jsonb;
  v_existing private.v3_confirmation_operations%rowtype;
  v_result jsonb;
  v_receipt_id uuid;
  v_accepted_at timestamptz;
  v_previous_credits_context text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Confirmation payload must be a JSON object' using errcode = '22023';
  end if;
  if _idempotency_key is null then
    raise exception 'Confirmation idempotency key is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;

  v_payload := private.v3_normalize_confirmation_credits_payload(payload);
  v_payload_session := nullif(btrim(coalesce(v_payload ->> 'browser_session_id', '')), '');
  if v_payload_session is null or v_payload_session <> _browser_session_id then
    raise exception 'Confirmation browser-session scope does not match payload'
      using errcode = '22023';
  end if;

  begin
    v_round_id := nullif(v_payload ->> 'round_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Confirmation round id is invalid' using errcode = '22023';
  end;
  if v_round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to((v_payload - 'client_ip')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform _request_hash;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-confirmation:' || _idempotency_key::text, 0)
  );

  select operation.*
  into v_existing
  from private.v3_confirmation_operations operation
  where operation.idempotency_key = _idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash
       or v_existing.round_id <> v_round_id
       or v_existing.browser_session_id <> _browser_session_id then
      raise exception 'Confirmation idempotency key was already used for a different request'
        using errcode = '22023';
    end if;

    return v_existing.result || jsonb_build_object(
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'receipt_id', v_existing.receipt_id,
        'idempotency_key', v_existing.idempotency_key,
        'request_hash', v_existing.request_hash,
        'round_id', v_existing.round_id,
        'accepted_at', v_existing.accepted_at,
        'replayed', true
      )
    );
  end if;

  v_previous_credits_context := current_setting(
    'solaris.v3_entry_credits_context',
    true
  );
  perform set_config(
    'solaris.v3_entry_credits_context',
    v_payload::text,
    true
  );

  begin
    select to_jsonb(public.submit_confirmation(v_payload)) into v_result;
  exception when others then
    perform set_config(
      'solaris.v3_entry_credits_context',
      coalesce(v_previous_credits_context, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'solaris.v3_entry_credits_context',
    coalesce(v_previous_credits_context, ''),
    true
  );

  if v_result is null then
    raise exception 'Confirmation submit returned no result' using errcode = '55000';
  end if;

  v_receipt_id := gen_random_uuid();
  v_accepted_at := now();

  insert into private.v3_confirmation_operations (
    idempotency_key,
    request_hash,
    round_id,
    browser_session_id,
    result,
    receipt_id,
    accepted_at
  ) values (
    _idempotency_key,
    v_request_hash,
    v_round_id,
    _browser_session_id,
    v_result,
    v_receipt_id,
    v_accepted_at
  );

  return v_result || jsonb_build_object(
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'receipt_id', v_receipt_id,
      'idempotency_key', _idempotency_key,
      'request_hash', v_request_hash,
      'round_id', v_round_id,
      'accepted_at', v_accepted_at,
      'replayed', false
    )
  );
end
$submit$;

revoke all on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  from public;
grant execute on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  to anon, authenticated, service_role;

-- Resolve only a country-account token owned by the current authenticated
-- delegation. Return an editor-safe projection rather than to_jsonb(submissions),
-- which would include internal admin notes, recovery codes, IPs and session data.
create or replace function public.public_country_account_resolve_edit_token(_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $resolve$
declare
  v_actor uuid := auth.uid();
  v_country public.countries;
  v_token_hash text;
  v_token public.edit_tokens;
  v_submission public.submissions;
  v_round public.submission_rounds;
  v_edition public.editions;
  v_internal jsonb;
  v_national_final jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('valid', false, 'reason', 'not_authenticated');
  end if;
  if nullif(btrim(coalesce(_token, '')), '') is null or length(_token) > 160 then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select c.*
  into v_country
  from public.country_accounts account
  join public.countries c on c.id = account.country_id
  where account.user_id = v_actor
    and account.status = 'active'
  limit 1;

  if v_country.id is null then
    return jsonb_build_object('valid', false, 'reason', 'not_authenticated');
  end if;

  v_token_hash := encode(extensions.digest(_token, 'sha256'), 'hex');

  select token.*
  into v_token
  from public.edit_tokens token
  where token.token_hash = v_token_hash
    and token.token_type = 'country_account'
    and token.active = true
    and (token.expires_at is null or token.expires_at > now())
  limit 1;

  if v_token.id is null then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = v_token.submission_id
    and lower(btrim(submission.country)) in (
      lower(btrim(v_country.name)),
      lower(btrim(v_country.short_code))
    );

  if v_submission.id is null then
    return jsonb_build_object('valid', false, 'reason', 'wrong_country');
  end if;

  select round.* into v_round
  from public.submission_rounds round
  where round.id = v_submission.round_id;

  select edition.* into v_edition
  from public.editions edition
  where edition.id = v_submission.edition_id;

  if coalesce(v_submission.locked, false) then
    return jsonb_build_object('valid', false, 'reason', 'locked');
  end if;
  if not coalesce(v_submission.editing_allowed, false)
     or not coalesce(v_edition.editing_enabled, false) then
    return jsonb_build_object('valid', false, 'reason', 'editing_closed');
  end if;

  select jsonb_build_object(
    'artist', entry.artist,
    'song_title', entry.song_title,
    'song_url', entry.song_url,
    'preview_start', entry.preview_start,
    'preview_end', entry.preview_end,
    'final_clip_start', entry.final_clip_start,
    'final_clip_end', entry.final_clip_end,
    'replacement_video_required', coalesce(entry.replacement_video_required, false),
    'replacement_video_url', entry.replacement_video_url,
    'credits', coalesce(entry.credits, '[]'::jsonb),
    'review_status', coalesce(entry.review_status, 'pending'),
    'review_reason', entry.review_reason,
    'reviewed_at', entry.reviewed_at
  )
  into v_internal
  from public.internal_entries entry
  where entry.submission_id = v_submission.id
  limit 1;

  select jsonb_build_object(
    'nf_name', nf.nf_name,
    'expected_entry_count', nf.expected_entry_count,
    'winning_entry_id', nf.winning_entry_id,
    'national_final_entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'artist', entry.artist,
          'song_title', entry.song_title,
          'song_url', entry.song_url,
          'position', entry.position,
          'preview_start', entry.preview_start,
          'preview_end', entry.preview_end,
          'final_clip_start', entry.final_clip_start,
          'final_clip_end', entry.final_clip_end,
          'replacement_video_required', coalesce(entry.replacement_video_required, false),
          'replacement_video_url', entry.replacement_video_url,
          'credits', coalesce(entry.credits, '[]'::jsonb),
          'review_status', coalesce(entry.review_status, 'pending'),
          'review_reason', entry.review_reason,
          'reviewed_at', entry.reviewed_at,
          'removed', coalesce(entry.removed, false)
        ) order by entry.position, entry.id
      )
      from public.national_final_entries entry
      where entry.national_final_id = nf.id
    ), '[]'::jsonb)
  )
  into v_national_final
  from public.national_finals nf
  where nf.submission_id = v_submission.id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'reason', 'ok',
    'submission', jsonb_build_object(
      'round_id', v_submission.round_id,
      'instagram_username', v_submission.instagram_username,
      'country', v_submission.country,
      'country_account', v_submission.country_account,
      'has_country_account', v_submission.has_country_account,
      'participating', v_submission.participating,
      'selection_method', v_submission.selection_method,
      'entry_unknown', v_submission.entry_unknown,
      'nf_entries_unknown', v_submission.nf_entries_unknown,
      'reveal_date_type', v_submission.reveal_date_type,
      'reveal_exact_date', v_submission.reveal_exact_date,
      'reveal_approximate_text', v_submission.reveal_approximate_text,
      'nf_date_type', v_submission.nf_date_type,
      'nf_exact_date', v_submission.nf_exact_date,
      'nf_approximate_text', v_submission.nf_approximate_text,
      'nf_result_date_type', v_submission.nf_result_date_type,
      'nf_result_exact_date', v_submission.nf_result_exact_date,
      'nf_result_approximate_text', v_submission.nf_result_approximate_text,
      'internal_entries', v_internal,
      'national_finals', v_national_final
    ),
    'round', jsonb_build_object(
      'id', v_round.id,
      'name', v_round.name,
      'status', v_round.status,
      'opens_at', v_round.opens_at,
      'closes_at', v_round.closes_at,
      'response_limit', v_round.response_limit,
      'response_count', (
        select count(*)::integer
        from public.submissions response
        where response.round_id = v_round.id
      ),
      'edition_id', v_edition.id,
      'edition_name', v_edition.name,
      'edition_number', v_edition.edition_number
    )
  );
end
$resolve$;

revoke all on function public.public_country_account_resolve_edit_token(text)
  from public, anon;
grant execute on function public.public_country_account_resolve_edit_token(text)
  to authenticated, service_role;

-- Authenticated HOD mutation adapter. It owns only the authorization/locking
-- boundary for an existing response, then delegates the write, idempotency,
-- credits, receipt and consequences to the canonical V3 submit command above.
create or replace function public.public_country_account_submit_confirmation_edit(
  _round_id uuid,
  _payload jsonb,
  _idempotency_key uuid,
  _browser_session_id text,
  _edit_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $edit$
declare
  v_actor uuid := auth.uid();
  v_country public.countries;
  v_token_hash text;
  v_token public.edit_tokens;
  v_submission public.submissions;
  v_edition public.editions;
  v_payload jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if _round_id is null
     or _idempotency_key is null
     or nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80
     or nullif(btrim(coalesce(_edit_token, '')), '') is null
     or length(_edit_token) > 160
     or _payload is null
     or jsonb_typeof(_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select c.*
  into v_country
  from public.country_accounts account
  join public.countries c on c.id = account.country_id
  where account.user_id = v_actor
    and account.status = 'active'
  limit 1;

  if v_country.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_token_hash := encode(extensions.digest(_edit_token, 'sha256'), 'hex');

  select token.*
  into v_token
  from public.edit_tokens token
  where token.token_hash = v_token_hash
    and token.token_type = 'country_account'
    and token.active = true
    and (token.expires_at is null or token.expires_at > now())
  limit 1;

  if v_token.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = v_token.submission_id
  for update;

  if v_submission.id is null
     or v_submission.round_id <> _round_id
     or lower(btrim(v_submission.country)) not in (
       lower(btrim(v_country.name)),
       lower(btrim(v_country.short_code))
     ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = v_submission.edition_id;

  if coalesce(v_submission.locked, false)
     or not coalesce(v_submission.editing_allowed, false)
     or not coalesce(v_edition.editing_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'editing_closed');
  end if;

  v_payload := (
    _payload - 'edit_token' - 'edit_token_hash' - 'client_ip'
  ) || jsonb_build_object(
    'round_id', _round_id,
    'browser_session_id', _browser_session_id,
    'edit_token_hash', v_token_hash
  );

  return public.v3_submit_confirmation(
    v_payload,
    _idempotency_key,
    'database-derived',
    _browser_session_id
  );
end
$edit$;

revoke all on function public.public_country_account_submit_confirmation_edit(uuid, jsonb, uuid, text, text)
  from public, anon;
grant execute on function public.public_country_account_submit_confirmation_edit(uuid, jsonb, uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

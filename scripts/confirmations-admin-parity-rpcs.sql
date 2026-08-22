-- Applied to the dedicated Confirmations Supabase project.
-- Restores organizer-only tools from the standalone Confirmations app while
-- keeping Solaris Studio's single organizer identity bridge.

create or replace function public.admin_confirmation_technical(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  if not exists (select 1 from public.submissions where id = _submission_id) then
    raise exception 'Submission not found';
  end if;

  return jsonb_build_object(
    'ip_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'ip_address', h.ip_address,
        'first_seen_at', h.first_seen_at,
        'last_seen_at', h.last_seen_at
      ) order by h.last_seen_at desc)
      from public.submission_ip_history h
      where h.submission_id = _submission_id
    ), '[]'::jsonb),
    'tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'token_type', t.token_type,
        'active', t.active,
        'created_at', t.created_at,
        'expires_at', t.expires_at,
        'last_used_at', t.last_used_at,
        'use_count', t.use_count
      ) order by t.created_at desc)
      from public.edit_tokens t
      where t.submission_id = _submission_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_confirmation_create_edit_token(
  _submission_id uuid,
  _token_type text,
  _expires_in_hours integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_token text;
  v_hash text;
  v_expires_at timestamptz;
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  if _token_type not in ('one_time', 'reusable') then
    raise exception 'Invalid token type';
  end if;

  if _expires_in_hours is not null and (_expires_in_hours < 1 or _expires_in_hours > 8760) then
    raise exception 'Invalid expiry';
  end if;

  if not exists (select 1 from public.submissions where id = _submission_id) then
    raise exception 'Submission not found';
  end if;

  update public.edit_tokens
  set active = false
  where submission_id = _submission_id
    and active = true;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires_at := case
    when _expires_in_hours is null then null
    else now() + make_interval(hours => _expires_in_hours)
  end;

  insert into public.edit_tokens(
    submission_id,
    token_hash,
    token_type,
    active,
    expires_at
  ) values (
    _submission_id,
    v_hash,
    _token_type,
    true,
    v_expires_at
  );

  return jsonb_build_object(
    'token', v_token,
    'token_type', _token_type,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.admin_confirmation_revoke_edit_token(_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  update public.edit_tokens
  set active = false
  where id = _token_id;

  if not found then
    raise exception 'Edit token not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_clear_confirmation_winner(
  _national_final_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_artist text;
  v_song text;
  v_reason text := btrim(coalesce(_reason, ''));
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  if v_reason = '' then
    raise exception 'A reason is required';
  end if;

  select nf.submission_id, nf.winning_entry_id, nfe.artist, nfe.song_title
  into v_submission_id, v_entry_id, v_artist, v_song
  from public.national_finals nf
  left join public.national_final_entries nfe on nfe.id = nf.winning_entry_id
  where nf.id = _national_final_id;

  if v_submission_id is null then
    raise exception 'National Final not found';
  end if;

  if v_entry_id is null then
    raise exception 'No winner is currently selected';
  end if;

  update public.national_finals
  set winning_entry_id = null
  where id = _national_final_id;

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
    v_submission_id,
    'national_final',
    v_entry_id,
    v_artist,
    v_song,
    'winner_cleared',
    v_reason,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'submission_id', v_submission_id);
end;
$$;

create or replace function public.admin_confirmation_delete_response(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  delete from public.submissions
  where id = _submission_id;

  if not found then
    raise exception 'Submission not found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_confirmation_next_in_line(_edition_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id,
      'edition_id', n.edition_id,
      'source_submission_id', n.source_submission_id,
      'country', n.country,
      'participating', n.participating,
      'entry_unknown', n.entry_unknown,
      'selection_type', n.selection_type,
      'national_final_entry_id', n.national_final_entry_id,
      'artist', n.artist,
      'song_title', n.song_title,
      'song_url', n.song_url,
      'preview_start', n.preview_start,
      'preview_end', n.preview_end,
      'submitted_at', n.submitted_at,
      'edition', case when e.id is null then null else jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'edition_number', e.edition_number
      ) end
    ) order by n.submitted_at desc)
    from public.next_in_line_submissions n
    left join public.editions e on e.id = n.edition_id
    where _edition_id is null or n.edition_id = _edition_id
  ), '[]'::jsonb);
end;
$$;
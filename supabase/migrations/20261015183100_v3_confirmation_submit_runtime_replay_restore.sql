begin;

-- Clean-replay parity repair for the canonical Confirmation submit runtime.
--
-- Long-lived production still has the proven submit_confirmation(jsonb)
-- implementation that predates the repository migration chain. The V3
-- authority wrapper deliberately calls that implementation transactionally,
-- but a fresh replay previously never recreated it. Restore the production
-- semantics forward-only, then make the legacy function an internal helper:
-- browser/service callers must enter through v3_submit_confirmation so the
-- authoritative idempotency receipt and S5 DomainEvent cannot be bypassed.

create or replace function public.submit_confirmation(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  r public.submission_rounds;
  existing public.submissions;
  sub public.submissions;
  tok public.edit_tokens;
  existing_internal public.internal_entries;
  existing_nf public.national_finals;
  item jsonb;
  avail jsonb;
  dup jsonb;
  snap jsonb;
  nf_id uuid;
  entry_id uuid;
  winner_id uuid;
  current_submission_id uuid;
  idx integer := 0;
  cnt integer;
  ip text := nullif(payload ->> 'client_ip', '');
  sess text := nullif(payload ->> 'browser_session_id', '');
  is_edit boolean := false;
  changed boolean := false;
  winner_artist text := nullif(trim(payload ->> 'artist'), '');
  winner_song text := nullif(trim(payload ->> 'song_title'), '');
begin
  if payload ->> 'round_id' is null then
    return jsonb_build_object('ok', false, 'error', 'closed', 'reason', 'ROUND_DISABLED');
  end if;

  select *
  into r
  from public.submission_rounds
  where id = (payload ->> 'round_id')::uuid
  for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'closed', 'reason', 'ROUND_DISABLED');
  end if;

  if nullif(payload ->> 'edit_token_hash', '') is not null then
    select *
    into tok
    from public.edit_tokens
    where token_hash = payload ->> 'edit_token_hash'
      and active = true
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if tok.id is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_token');
    end if;

    select * into existing
    from public.submissions
    where id = tok.submission_id;

    if existing.id is null or existing.round_id <> r.id or existing.locked then
      return jsonb_build_object('ok', false, 'error', 'invalid_token');
    end if;
    is_edit := true;
  else
    select *
    into existing
    from public.submissions
    where round_id = r.id
      and lower(trim(country)) = lower(trim(payload ->> 'country'))
    limit 1;

    if existing.id is not null then
      if existing.locked
         or not existing.editing_allowed
         or not coalesce(r.editing_enabled, true) then
        return jsonb_build_object('ok', false, 'error', 'duplicate');
      end if;
      is_edit := true;
    end if;
  end if;

  if not is_edit then
    avail := public.round_availability(r.id);
    if not coalesce((avail ->> 'can_accept')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', case when avail ->> 'reason' = 'RESPONSE_LIMIT_REACHED' then 'full' else 'closed' end,
        'reason', avail ->> 'reason'
      );
    end if;
  end if;

  current_submission_id := case
    when is_edit then existing.id
    else '00000000-0000-0000-0000-000000000000'::uuid
  end;

  if coalesce((payload ->> 'participating')::boolean, true)
     and payload ->> 'selection_method' = 'internal'
     and not coalesce((payload ->> 'entry_unknown')::boolean, false) then
    dup := public.find_entry_duplicate(
      r.edition_id,
      current_submission_id,
      payload ->> 'artist',
      payload ->> 'song_title',
      payload ->> 'song_url'
    );
    if coalesce((dup ->> 'duplicate')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'error', case when dup ->> 'type' = 'artist' then 'duplicate_artist' else 'duplicate_song' end
      );
    end if;
  end if;

  if coalesce((payload ->> 'participating')::boolean, true)
     and payload ->> 'selection_method' = 'national_final'
     and not coalesce((payload ->> 'nf_entries_unknown')::boolean, false) then
    for item in
      select * from jsonb_array_elements(coalesce(payload -> 'nf_entries', '[]'::jsonb))
    loop
      dup := public.find_entry_duplicate(
        r.edition_id,
        current_submission_id,
        item ->> 'artist',
        item ->> 'song_title',
        item ->> 'song_url'
      );
      if coalesce((dup ->> 'duplicate')::boolean, false) then
        return jsonb_build_object(
          'ok', false,
          'error', case when dup ->> 'type' = 'artist' then 'duplicate_artist' else 'duplicate_song' end
        );
      end if;
    end loop;
  end if;

  if is_edit then
    snap := jsonb_build_object(
      'submission', to_jsonb(existing),
      'internal', (
        select to_jsonb(i)
        from public.internal_entries i
        where i.submission_id = existing.id
        limit 1
      ),
      'national_final', (
        select to_jsonb(n)
        from public.national_finals n
        where n.submission_id = existing.id
        limit 1
      ),
      'nf_entries', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.position), '[]'::jsonb)
        from public.national_final_entries e
        join public.national_finals n on n.id = e.national_final_id
        where n.submission_id = existing.id
      )
    );

    insert into public.submission_versions(submission_id, version, snapshot)
    values (existing.id, existing.edit_count + 1, snap);
  end if;

  if not is_edit then
    insert into public.submissions(
      edition_id,
      round_id,
      instagram_username,
      country,
      country_account,
      has_country_account,
      participating,
      selection_method,
      entry_unknown,
      nf_entries_unknown,
      reveal_date_type,
      reveal_exact_date,
      reveal_approximate_text,
      nf_date_type,
      nf_exact_date,
      nf_approximate_text,
      nf_result_date_type,
      nf_result_exact_date,
      nf_result_approximate_text,
      initial_ip,
      latest_ip,
      browser_session_id,
      editing_allowed
    ) values (
      r.edition_id,
      r.id,
      payload ->> 'instagram_username',
      trim(payload ->> 'country'),
      nullif(trim(payload ->> 'country_account'), ''),
      coalesce((payload ->> 'has_country_account')::boolean, false),
      coalesce((payload ->> 'participating')::boolean, true),
      nullif(payload ->> 'selection_method', ''),
      coalesce((payload ->> 'entry_unknown')::boolean, false),
      coalesce((payload ->> 'nf_entries_unknown')::boolean, false),
      nullif(payload ->> 'reveal_date_type', ''),
      nullif(payload ->> 'reveal_exact_date', '')::date,
      nullif(payload ->> 'reveal_approximate_text', ''),
      nullif(payload ->> 'nf_date_type', ''),
      nullif(payload ->> 'nf_exact_date', '')::date,
      nullif(payload ->> 'nf_approximate_text', ''),
      nullif(payload ->> 'nf_result_date_type', ''),
      nullif(payload ->> 'nf_result_exact_date', '')::date,
      nullif(payload ->> 'nf_result_approximate_text', ''),
      ip,
      ip,
      sess,
      false
    )
    returning * into sub;
  else
    update public.submissions
    set instagram_username = payload ->> 'instagram_username',
        country = coalesce(nullif(trim(payload ->> 'country'), ''), country),
        country_account = nullif(trim(payload ->> 'country_account'), ''),
        has_country_account = coalesce((payload ->> 'has_country_account')::boolean, false),
        participating = coalesce((payload ->> 'participating')::boolean, true),
        selection_method = nullif(payload ->> 'selection_method', ''),
        entry_unknown = coalesce((payload ->> 'entry_unknown')::boolean, false),
        nf_entries_unknown = coalesce((payload ->> 'nf_entries_unknown')::boolean, false),
        reveal_date_type = nullif(payload ->> 'reveal_date_type', ''),
        reveal_exact_date = nullif(payload ->> 'reveal_exact_date', '')::date,
        reveal_approximate_text = nullif(payload ->> 'reveal_approximate_text', ''),
        nf_date_type = nullif(payload ->> 'nf_date_type', ''),
        nf_exact_date = nullif(payload ->> 'nf_exact_date', '')::date,
        nf_approximate_text = nullif(payload ->> 'nf_approximate_text', ''),
        nf_result_date_type = nullif(payload ->> 'nf_result_date_type', ''),
        nf_result_exact_date = nullif(payload ->> 'nf_result_exact_date', '')::date,
        nf_result_approximate_text = nullif(payload ->> 'nf_result_approximate_text', ''),
        edit_count = existing.edit_count + 1,
        editing_allowed = false,
        latest_ip = coalesce(ip, latest_ip),
        initial_ip = coalesce(initial_ip, ip),
        updated_at = now()
    where id = existing.id
    returning * into sub;
  end if;

  if ip is not null then
    insert into public.submission_ip_history(submission_id, ip_address)
    values (sub.id, ip)
    on conflict(submission_id, ip_address) do update
      set last_seen_at = now();
  end if;

  if sess is not null then
    insert into public.submission_browser_sessions(submission_id, browser_session_id, last_used_at)
    values (sub.id, sess, now())
    on conflict(submission_id, browser_session_id) do update
      set last_used_at = now();
  end if;

  if not sub.participating
     or sub.selection_method is null
     or sub.selection_method = 'unknown' then
    delete from public.internal_entries where submission_id = sub.id;
    delete from public.national_finals where submission_id = sub.id;

  elsif sub.selection_method = 'internal' then
    delete from public.national_finals where submission_id = sub.id;

    select *
    into existing_internal
    from public.internal_entries
    where submission_id = sub.id
    limit 1;

    if existing_internal.id is null then
      insert into public.internal_entries(
        submission_id,
        artist,
        song_title,
        song_url,
        preview_start,
        preview_end,
        final_clip_start,
        final_clip_end,
        replacement_video_required,
        replacement_video_url
      ) values (
        sub.id,
        nullif(payload ->> 'artist', ''),
        nullif(payload ->> 'song_title', ''),
        nullif(payload ->> 'song_url', ''),
        nullif(payload ->> 'preview_start', ''),
        nullif(payload ->> 'preview_end', ''),
        nullif(payload ->> 'final_clip_start', ''),
        nullif(payload ->> 'final_clip_end', ''),
        coalesce((payload ->> 'replacement_video_required')::boolean, false),
        nullif(payload ->> 'replacement_video_url', '')
      );
    else
      changed :=
        public.normalize_entry_text(existing_internal.artist)
          <> public.normalize_entry_text(payload ->> 'artist')
        or public.normalize_entry_text(existing_internal.song_title)
          <> public.normalize_entry_text(payload ->> 'song_title')
        or lower(trim(coalesce(existing_internal.song_url, '')))
          <> lower(trim(coalesce(payload ->> 'song_url', '')))
        or coalesce(existing_internal.preview_start, '')
          <> coalesce(payload ->> 'preview_start', '')
        or coalesce(existing_internal.final_clip_start, '')
          <> coalesce(payload ->> 'final_clip_start', '')
        or coalesce(existing_internal.replacement_video_required, false)
          <> coalesce((payload ->> 'replacement_video_required')::boolean, false)
        or coalesce(existing_internal.replacement_video_url, '')
          <> coalesce(payload ->> 'replacement_video_url', '');

      update public.internal_entries
      set artist = nullif(payload ->> 'artist', ''),
          song_title = nullif(payload ->> 'song_title', ''),
          song_url = nullif(payload ->> 'song_url', ''),
          preview_start = nullif(payload ->> 'preview_start', ''),
          preview_end = nullif(payload ->> 'preview_end', ''),
          final_clip_start = nullif(payload ->> 'final_clip_start', ''),
          final_clip_end = nullif(payload ->> 'final_clip_end', ''),
          replacement_video_required = coalesce((payload ->> 'replacement_video_required')::boolean, false),
          replacement_video_url = nullif(payload ->> 'replacement_video_url', ''),
          review_status = case when changed then 'pending' else review_status end,
          review_reason = case when changed then null else review_reason end,
          reviewed_at = case when changed then null else reviewed_at end,
          reviewed_by = case when changed then null else reviewed_by end
      where id = existing_internal.id;
    end if;

  elsif sub.selection_method = 'national_final' then
    delete from public.internal_entries where submission_id = sub.id;

    select *
    into existing_nf
    from public.national_finals
    where submission_id = sub.id
    limit 1;

    if existing_nf.id is null then
      insert into public.national_finals(
        submission_id,
        nf_name,
        expected_entry_count,
        winning_entry_id
      ) values (
        sub.id,
        nullif(payload ->> 'nf_name', ''),
        nullif(payload ->> 'expected_entry_count', '')::integer,
        null
      )
      returning id into nf_id;
    else
      nf_id := existing_nf.id;
      update public.national_finals
      set nf_name = nullif(payload ->> 'nf_name', ''),
          expected_entry_count = nullif(payload ->> 'expected_entry_count', '')::integer
      where id = nf_id;
    end if;

    delete from public.national_final_entries e
    where e.national_final_id = nf_id
      and coalesce(e.removed, false) = false
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(payload -> 'nf_entries', '[]'::jsonb)) incoming
        where public.normalize_entry_text(incoming ->> 'artist') = public.normalize_entry_text(e.artist)
          and public.normalize_entry_text(incoming ->> 'song_title') = public.normalize_entry_text(e.song_title)
      );

    idx := 0;
    winner_id := null;
    for item in
      select * from jsonb_array_elements(coalesce(payload -> 'nf_entries', '[]'::jsonb))
    loop
      entry_id := null;
      select e.id
      into entry_id
      from public.national_final_entries e
      where e.national_final_id = nf_id
        and coalesce(e.removed, false) = false
        and public.normalize_entry_text(e.artist) = public.normalize_entry_text(item ->> 'artist')
        and public.normalize_entry_text(e.song_title) = public.normalize_entry_text(item ->> 'song_title')
      limit 1;

      if entry_id is null then
        insert into public.national_final_entries(
          national_final_id,
          artist,
          song_title,
          song_url,
          position
        ) values (
          nf_id,
          nullif(item ->> 'artist', ''),
          nullif(item ->> 'song_title', ''),
          nullif(item ->> 'song_url', ''),
          idx
        )
        returning id into entry_id;
      else
        select lower(trim(coalesce(e.song_url, '')))
               <> lower(trim(coalesce(item ->> 'song_url', '')))
        into changed
        from public.national_final_entries e
        where e.id = entry_id;

        update public.national_final_entries
        set artist = nullif(item ->> 'artist', ''),
            song_title = nullif(item ->> 'song_title', ''),
            song_url = nullif(item ->> 'song_url', ''),
            position = idx,
            review_status = case when changed then 'pending' else review_status end,
            review_reason = case when changed then null else review_reason end,
            reviewed_at = case when changed then null else reviewed_at end,
            reviewed_by = case when changed then null else reviewed_by end
        where id = entry_id;
      end if;

      if winner_artist is not null
         and winner_song is not null
         and public.normalize_entry_text(item ->> 'artist') = public.normalize_entry_text(winner_artist)
         and public.normalize_entry_text(item ->> 'song_title') = public.normalize_entry_text(winner_song) then
        winner_id := entry_id;
        update public.national_final_entries
        set preview_start = nullif(payload ->> 'preview_start', ''),
            preview_end = nullif(payload ->> 'preview_end', ''),
            final_clip_start = nullif(payload ->> 'final_clip_start', ''),
            final_clip_end = nullif(payload ->> 'final_clip_end', ''),
            replacement_video_required = coalesce((payload ->> 'replacement_video_required')::boolean, false),
            replacement_video_url = nullif(payload ->> 'replacement_video_url', '')
        where id = entry_id;
      end if;

      idx := idx + 1;
    end loop;

    update public.national_final_entries
    set preview_start = null,
        preview_end = null,
        final_clip_start = null,
        final_clip_end = null,
        replacement_video_required = false,
        replacement_video_url = null
    where national_final_id = nf_id
      and (winner_id is null or id <> winner_id);

    update public.national_finals
    set winning_entry_id = winner_id
    where id = nf_id;
  end if;

  if tok.id is not null then
    update public.edit_tokens
    set use_count = use_count + 1,
        last_used_at = now(),
        active = case when token_type = 'one_time' then false else active end
    where id = tok.id;
  end if;

  select count(*)
  into cnt
  from public.submissions
  where round_id = r.id;

  if r.response_limit is not null and cnt >= r.response_limit and r.status = 'open' then
    update public.submission_rounds
    set status = 'auto_closed'
    where id = r.id;
  end if;

  if sess is not null then
    update public.submission_drafts
    set submitted_submission_id = sub.id,
        updated_at = now()
    where round_id = r.id
      and browser_session_id = sess;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', sub.id,
    'recovery_code', sub.recovery_code
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
end
$function$;

-- The legacy implementation is no longer a public command surface. All callers
-- must use v3_submit_confirmation so idempotency, authoritative receipt evidence,
-- S2 bridging and S5 DomainEvents are unavoidable.
revoke all on function public.submit_confirmation(jsonb)
  from public, anon, authenticated, service_role;

-- Verify the old bypass cannot silently reopen on clean replay or upgrade.
do $verify$
begin
  if has_function_privilege('anon', 'public.submit_confirmation(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.submit_confirmation(jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.submit_confirmation(jsonb)', 'EXECUTE') then
    raise exception 'Legacy Confirmation submit remains directly executable outside V3 authority';
  end if;

  if not has_function_privilege('anon', 'public.v3_submit_confirmation(jsonb,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.v3_submit_confirmation(jsonb,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.v3_submit_confirmation(jsonb,uuid,text,text)', 'EXECUTE') then
    raise exception 'V3 Confirmation authority is missing required runtime execute grants';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

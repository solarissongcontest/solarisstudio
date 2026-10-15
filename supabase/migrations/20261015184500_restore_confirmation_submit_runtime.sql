begin;

-- Replay-parity repair for the canonical Confirmation runtime.
--
-- Production still carries these objects from the historical standalone
-- Confirmations deployment, while the checked-in reconstruction migration only
-- restored the underlying tables. V3 intentionally wraps submit_confirmation(),
-- so a fresh database must reconstruct the same deployed runtime before the S5
-- event bridge can be exercised. This is a forward, idempotent repair: hosted
-- production receives CREATE OR REPLACE definitions for behavior it already has;
-- fresh replay receives the previously missing functions and triggers.

create or replace function public.normalize_entry_text(value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $normalize$
  select regexp_replace(lower(trim(coalesce(value, ''))), '[[:space:][:punct:]]+', '', 'g');
$normalize$;

revoke all on function public.normalize_entry_text(text) from public;
grant execute on function public.normalize_entry_text(text)
  to anon, authenticated, service_role;

create or replace function public.find_entry_duplicate(
  _edition_id uuid,
  _submission_id uuid,
  _artist text,
  _song_title text,
  _song_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $duplicate$
declare
  na text := public.normalize_entry_text(_artist);
  ns text := public.normalize_entry_text(_song_title);
  nu text := lower(trim(coalesce(_song_url, '')));
begin
  if na = '' and ns = '' and nu = '' then
    return jsonb_build_object('duplicate', false);
  end if;

  if exists (
    select 1
    from public.internal_entries i
    join public.submissions s on s.id = i.submission_id
    where s.id <> coalesce(_submission_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        (na <> '' and ns <> ''
          and public.normalize_entry_text(i.artist) = na
          and public.normalize_entry_text(i.song_title) = ns)
        or (nu <> '' and lower(trim(coalesce(i.song_url, ''))) = nu)
      )
  ) then
    return jsonb_build_object('duplicate', true, 'type', 'song');
  end if;

  if exists (
    select 1
    from public.national_final_entries e
    join public.national_finals nf on nf.id = e.national_final_id
    join public.submissions s on s.id = nf.submission_id
    where s.id <> coalesce(_submission_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        (na <> '' and ns <> ''
          and public.normalize_entry_text(e.artist) = na
          and public.normalize_entry_text(e.song_title) = ns)
        or (nu <> '' and lower(trim(coalesce(e.song_url, ''))) = nu)
      )
  ) then
    return jsonb_build_object('duplicate', true, 'type', 'song');
  end if;

  if na <> '' and exists (
    select 1
    from public.submissions s
    left join public.internal_entries i on i.submission_id = s.id
    left join public.national_finals nf on nf.submission_id = s.id
    left join public.national_final_entries e on e.national_final_id = nf.id
    where s.edition_id = _edition_id
      and s.id <> coalesce(_submission_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        public.normalize_entry_text(i.artist) = na
        or public.normalize_entry_text(e.artist) = na
      )
  ) then
    return jsonb_build_object('duplicate', true, 'type', 'artist');
  end if;

  return jsonb_build_object('duplicate', false, 'type', null);
end
$duplicate$;

revoke all on function public.find_entry_duplicate(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.find_entry_duplicate(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.round_availability(_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $availability$
declare
  r public.submission_rounds;
  e public.editions;
  cnt integer;
  reason text;
begin
  select * into r
  from public.submission_rounds
  where id = _round_id;

  if r is null then
    return jsonb_build_object(
      'can_accept', false,
      'reason', 'ROUND_DISABLED',
      'count', 0,
      'limit', null,
      'remaining', 0,
      'status', null,
      'server_time', now()
    );
  end if;

  select * into e
  from public.editions
  where id = r.edition_id;

  select count(*) into cnt
  from public.submissions
  where round_id = r.id;

  if e is null or e.status <> 'active' then
    reason := 'ROUND_DISABLED';
  elsif r.status = 'draft' then
    reason := 'ROUND_DISABLED';
  elsif r.status = 'closed' then
    reason := 'MANUALLY_CLOSED';
  elsif r.status = 'auto_closed' then
    reason := case
      when r.response_limit is not null and cnt >= r.response_limit
        then 'RESPONSE_LIMIT_REACHED'
      else 'MANUALLY_CLOSED'
    end;
  elsif r.opens_at is not null and r.opens_at > now() then
    reason := 'NOT_OPEN_YET';
  elsif r.closes_at is not null and r.closes_at <= now() then
    reason := 'DEADLINE_PASSED';
  elsif r.response_limit is not null and cnt >= r.response_limit then
    reason := 'RESPONSE_LIMIT_REACHED';
  elsif r.status = 'open' then
    reason := 'OPEN';
  else
    reason := 'ROUND_DISABLED';
  end if;

  return jsonb_build_object(
    'can_accept', reason = 'OPEN',
    'reason', reason,
    'count', cnt,
    'limit', r.response_limit,
    'remaining', case
      when r.response_limit is null then null
      else greatest(r.response_limit - cnt, 0)
    end,
    'status', r.status,
    'opens_at', r.opens_at,
    'closes_at', r.closes_at,
    'server_time', now()
  );
end
$availability$;

revoke all on function public.round_availability(uuid) from public;
grant execute on function public.round_availability(uuid)
  to anon, authenticated, service_role;

create or replace function public.generate_recovery_code()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $generate$
declare
  raw_code text;
  candidate text;
begin
  loop
    raw_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
    candidate := substr(raw_code, 1, 4)
      || '-' || substr(raw_code, 5, 4)
      || '-' || substr(raw_code, 9, 4);
    exit when not exists (
      select 1
      from public.submissions s
      where upper(s.recovery_code) = upper(candidate)
    );
  end loop;
  return candidate;
end
$generate$;

revoke all on function public.generate_recovery_code()
  from public, anon, authenticated;
grant execute on function public.generate_recovery_code() to service_role;

create or replace function public.ensure_submission_recovery_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $recovery$
begin
  if new.recovery_code is null or trim(new.recovery_code) = '' then
    new.recovery_code := public.generate_recovery_code();
  else
    new.recovery_code := upper(trim(new.recovery_code));
  end if;
  return new;
end
$recovery$;

revoke all on function public.ensure_submission_recovery_code()
  from public, anon, authenticated;
grant execute on function public.ensure_submission_recovery_code() to service_role;

create or replace function public.register_submission_browser()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $browser$
begin
  if new.browser_session_id is not null and trim(new.browser_session_id) <> '' then
    insert into public.submission_browser_sessions (
      submission_id,
      browser_session_id
    ) values (
      new.id,
      new.browser_session_id
    )
    on conflict (submission_id, browser_session_id) do update
    set last_used_at = now();
  end if;
  return new;
end
$browser$;

revoke all on function public.register_submission_browser()
  from public, anon, authenticated;
grant execute on function public.register_submission_browser() to service_role;

create or replace function public.sync_round_stats()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $stats$
declare
  rid uuid;
begin
  rid := case when tg_op = 'DELETE' then old.round_id else new.round_id end;

  insert into public.round_stats (round_id, submitted_count, updated_at)
  values (
    rid,
    (select count(*) from public.submissions where round_id = rid),
    now()
  )
  on conflict (round_id) do update
  set submitted_count = excluded.submitted_count,
      updated_at = now();

  return null;
end
$stats$;

revoke all on function public.sync_round_stats()
  from public, anon, authenticated;
grant execute on function public.sync_round_stats() to service_role;

drop trigger if exists ensure_submission_recovery_code_trg on public.submissions;
create trigger ensure_submission_recovery_code_trg
before insert on public.submissions
for each row execute function public.ensure_submission_recovery_code();

drop trigger if exists register_submission_browser_trg on public.submissions;
create trigger register_submission_browser_trg
after insert on public.submissions
for each row execute function public.register_submission_browser();

drop trigger if exists submissions_stats_trg on public.submissions;
create trigger submissions_stats_trg
after insert or delete on public.submissions
for each row execute function public.sync_round_stats();

create or replace function public.submit_confirmation(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $submit$
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

  select * into r
  from public.submission_rounds
  where id = (payload ->> 'round_id')::uuid
  for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'closed', 'reason', 'ROUND_DISABLED');
  end if;

  if nullif(payload ->> 'edit_token_hash', '') is not null then
    select * into tok
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
    select * into existing
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
        'error', case
          when avail ->> 'reason' = 'RESPONSE_LIMIT_REACHED' then 'full'
          else 'closed'
        end,
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
    for item in select * from jsonb_array_elements(coalesce(payload -> 'nf_entries', '[]'::jsonb)) loop
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
    insert into public.submission_versions (submission_id, version, snapshot)
    values (existing.id, existing.edit_count + 1, snap);
  end if;

  if not is_edit then
    insert into public.submissions (
      edition_id, round_id, instagram_username, country, country_account,
      has_country_account, participating, selection_method, entry_unknown,
      nf_entries_unknown, reveal_date_type, reveal_exact_date,
      reveal_approximate_text, nf_date_type, nf_exact_date,
      nf_approximate_text, nf_result_date_type, nf_result_exact_date,
      nf_result_approximate_text, initial_ip, latest_ip, browser_session_id,
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
    ) returning * into sub;
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
    insert into public.submission_ip_history (submission_id, ip_address)
    values (sub.id, ip)
    on conflict (submission_id, ip_address) do update
    set last_seen_at = now();
  end if;

  if sess is not null then
    insert into public.submission_browser_sessions (
      submission_id, browser_session_id, last_used_at
    ) values (
      sub.id, sess, now()
    )
    on conflict (submission_id, browser_session_id) do update
    set last_used_at = now();
  end if;

  if not sub.participating
     or sub.selection_method is null
     or sub.selection_method = 'unknown' then
    delete from public.internal_entries where submission_id = sub.id;
    delete from public.national_finals where submission_id = sub.id;
  elsif sub.selection_method = 'internal' then
    delete from public.national_finals where submission_id = sub.id;

    select * into existing_internal
    from public.internal_entries
    where submission_id = sub.id
    limit 1;

    if existing_internal.id is null then
      insert into public.internal_entries (
        submission_id, artist, song_title, song_url, preview_start, preview_end,
        final_clip_start, final_clip_end, replacement_video_required,
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
      changed := public.normalize_entry_text(existing_internal.artist)
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

    select * into existing_nf
    from public.national_finals
    where submission_id = sub.id
    limit 1;

    if existing_nf.id is null then
      insert into public.national_finals (
        submission_id, nf_name, expected_entry_count, winning_entry_id
      ) values (
        sub.id,
        nullif(payload ->> 'nf_name', ''),
        nullif(payload ->> 'expected_entry_count', '')::integer,
        null
      ) returning id into nf_id;
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
        where public.normalize_entry_text(incoming ->> 'artist')
              = public.normalize_entry_text(e.artist)
          and public.normalize_entry_text(incoming ->> 'song_title')
              = public.normalize_entry_text(e.song_title)
      );

    idx := 0;
    winner_id := null;
    for item in select * from jsonb_array_elements(coalesce(payload -> 'nf_entries', '[]'::jsonb)) loop
      entry_id := null;
      select e.id into entry_id
      from public.national_final_entries e
      where e.national_final_id = nf_id
        and coalesce(e.removed, false) = false
        and public.normalize_entry_text(e.artist)
            = public.normalize_entry_text(item ->> 'artist')
        and public.normalize_entry_text(e.song_title)
            = public.normalize_entry_text(item ->> 'song_title')
      limit 1;

      if entry_id is null then
        insert into public.national_final_entries (
          national_final_id, artist, song_title, song_url, position
        ) values (
          nf_id,
          nullif(item ->> 'artist', ''),
          nullif(item ->> 'song_title', ''),
          nullif(item ->> 'song_url', ''),
          idx
        ) returning id into entry_id;
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
         and public.normalize_entry_text(item ->> 'artist')
             = public.normalize_entry_text(winner_artist)
         and public.normalize_entry_text(item ->> 'song_title')
             = public.normalize_entry_text(winner_song) then
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

  select count(*) into cnt
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
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'duplicate');
end
$submit$;

revoke all on function public.submit_confirmation(jsonb) from public;
grant execute on function public.submit_confirmation(jsonb)
  to anon, authenticated, service_role;

commit;

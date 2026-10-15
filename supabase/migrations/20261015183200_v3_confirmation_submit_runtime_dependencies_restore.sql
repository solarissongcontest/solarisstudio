begin;

-- Complete the clean-replay restoration started by 20261015183100.
-- Production inherited these helper functions and submission triggers from the
-- historical Confirmations deployment, but the repository replay chain only
-- reconstructed their tables. submit_confirmation(jsonb) depends on these
-- objects at runtime, so restore the deployed dependency set forward-only.

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
  select * into r from public.submission_rounds where id = _round_id;

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

  select * into e from public.editions where id = r.edition_id;
  select count(*) into cnt from public.submissions where round_id = r.id;

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
    insert into public.submission_browser_sessions(submission_id, browser_session_id)
    values (new.id, new.browser_session_id)
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

  insert into public.round_stats(round_id, submitted_count, updated_at)
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

commit;

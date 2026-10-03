begin;

-- Organisation OS V5 Next in Line canonical window + public runtime.
-- This migration intentionally does not invent scoring/results. It makes the
-- existing participation mechanism reproducible, server-authoritative and
-- administratively operable.

insert into public.studio2_capabilities (key, domain, label, description, access_level)
values (
  'next_in_line.manage',
  'entry',
  'Manage Next in Line',
  'Configure and operate the Next in Line participation window and review its submissions.',
  'operate'
)
on conflict (key) do update set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  access_level = excluded.access_level;

insert into public.studio2_role_capabilities (role_key, capability)
values
  ('superadmin', 'next_in_line.manage'),
  ('organizer', 'next_in_line.manage')
on conflict do nothing;

create table if not exists public.studio2_next_in_line_windows (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  enabled boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'open', 'closed', 'cancelled')),
  opens_at timestamptz,
  closes_at timestamptz,
  version bigint not null default 1 check (version > 0),
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint studio2_next_in_line_window_time_order
    check (opens_at is null or closes_at is null or closes_at > opens_at)
);

create unique index if not exists studio2_next_in_line_one_open_window_idx
  on public.studio2_next_in_line_windows ((true))
  where enabled = true and status = 'open';

alter table public.studio2_next_in_line_windows enable row level security;
revoke all on table public.studio2_next_in_line_windows
  from public, anon, authenticated;
grant all on table public.studio2_next_in_line_windows to service_role;

create or replace function private.studio2_next_in_line_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $allowed$
  select case
    when p_from = p_to then true
    when p_from = 'draft' then p_to in ('scheduled', 'open', 'cancelled')
    when p_from = 'scheduled' then p_to in ('draft', 'open', 'closed', 'cancelled')
    when p_from = 'open' then p_to in ('closed', 'cancelled')
    when p_from = 'closed' then p_to in ('scheduled', 'open', 'cancelled')
    when p_from = 'cancelled' then p_to = 'draft'
    else false
  end;
$allowed$;

revoke all on function private.studio2_next_in_line_transition_allowed(text, text)
  from public, anon, authenticated;

create or replace function private.studio2_next_in_line_normalize(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $normalize$
  select lower(regexp_replace(coalesce(p_value, ''), '[^[:alnum:]]+', '', 'g'));
$normalize$;

revoke all on function private.studio2_next_in_line_normalize(text)
  from public, anon, authenticated;

create or replace function private.studio2_next_in_line_window_is_open(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $is_open$
  select coalesce((
    select
      nil_window.enabled
      and nil_window.status = 'open'
      and (nil_window.opens_at is null or nil_window.opens_at <= now())
      and (nil_window.closes_at is null or nil_window.closes_at > now())
    from public.studio2_next_in_line_windows nil_window
    where nil_window.edition_id = p_edition_id
  ), false);
$is_open$;

revoke all on function private.studio2_next_in_line_window_is_open(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_next_in_line_source_eligible(
  p_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $eligible$
  select coalesce((
    select
      submission.participating = true
      and submission.selection_method in ('internal', 'national_final')
      and (
        (
          submission.selection_method = 'internal'
          and exists (
            select 1
            from public.internal_entries entry
            where entry.submission_id = submission.id
              and entry.review_status = 'accepted'
              and nullif(btrim(entry.song_title), '') is not null
          )
        )
        or (
          submission.selection_method = 'national_final'
          and exists (
            select 1
            from public.national_finals nf
            join public.national_final_entries winner
              on winner.id = nf.winning_entry_id
             and winner.national_final_id = nf.id
            where nf.submission_id = submission.id
              and winner.review_status = 'accepted'
              and coalesce(winner.removed, false) = false
          )
        )
      )
    from public.submissions submission
    where submission.id = p_submission_id
  ), false);
$eligible$;

revoke all on function private.studio2_next_in_line_source_eligible(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_next_in_line_admin_snapshot(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_window public.studio2_next_in_line_windows;
begin
  if not public.studio2_access_allowed('next_in_line.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: next_in_line.manage'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  select *
  into v_window
  from public.studio2_next_in_line_windows
  where edition_id = p_edition_id;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'enabled', coalesce(v_nil_window.enabled, false),
    'status', coalesce(v_nil_window.status, 'draft'),
    'opensAt', v_nil_window.opens_at,
    'closesAt', v_nil_window.closes_at,
    'version', coalesce(v_window.version, 0),
    'reason', v_window.reason,
    'changedAt', v_nil_window.changed_at,
    'effectiveOpen', private.studio2_next_in_line_window_is_open(p_edition_id),
    'eligibleCountries', (
      select count(*)
      from public.submissions submission
      where submission.edition_id = p_edition_id
        and private.studio2_next_in_line_source_eligible(submission.id)
    ),
    'submittedCount', (
      select count(*)
      from public.next_in_line_submissions nil
      where nil.edition_id = p_edition_id
        and nil.participating = true
    )
  );
end
$snapshot$;

revoke all on function public.studio2_next_in_line_admin_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_next_in_line_admin_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_next_in_line_window_change_preview(
  p_edition_id uuid,
  p_target_status text,
  p_enabled boolean,
  p_opens_at timestamptz default null,
  p_closes_at timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_window public.studio2_next_in_line_windows;
  v_current_status text;
  v_target text := lower(btrim(coalesce(p_target_status, '')));
  v_version bigint;
begin
  if not public.studio2_access_allowed('next_in_line.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: next_in_line.manage'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;
  if v_target not in ('draft', 'scheduled', 'open', 'closed', 'cancelled') then
    raise exception 'Unknown Next in Line window state' using errcode = '22023';
  end if;
  if p_opens_at is not null and p_closes_at is not null and p_closes_at <= p_opens_at then
    raise exception 'Next in Line closing time must be after opening time'
      using errcode = '22023';
  end if;
  if v_target = 'scheduled' and p_opens_at is null then
    raise exception 'Scheduled Next in Line requires an opening time'
      using errcode = '22023';
  end if;
  if v_target = 'open' and p_closes_at is not null and p_closes_at <= now() then
    raise exception 'Cannot open Next in Line with an expired closing time'
      using errcode = '22023';
  end if;

  select *
  into v_window
  from public.studio2_next_in_line_windows
  where edition_id = p_edition_id;

  v_current_status := coalesce(v_nil_window.status, 'draft');
  v_version := coalesce(v_window.version, 0);

  if not private.studio2_next_in_line_transition_allowed(v_current_status, v_target) then
    raise exception 'Invalid Next in Line transition: % -> %', v_current_status, v_target
      using errcode = '23514';
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'currentStatus', v_current_status,
    'targetStatus', v_target,
    'enabled', p_enabled,
    'opensAt', p_opens_at,
    'closesAt', p_closes_at,
    'expectedVersion', v_version,
    'riskClass', case when v_target in ('open', 'closed', 'cancelled') then 'R2' else 'R1' end,
    'eligibleCountries', (
      select count(*)
      from public.submissions submission
      where submission.edition_id = p_edition_id
        and private.studio2_next_in_line_source_eligible(submission.id)
    ),
    'submittedCount', (
      select count(*)
      from public.next_in_line_submissions nil
      where nil.edition_id = p_edition_id
        and nil.participating = true
    )
  );
end
$preview$;

revoke all on function public.studio2_next_in_line_window_change_preview(
  uuid, text, boolean, timestamptz, timestamptz
) from public, anon;
grant execute on function public.studio2_next_in_line_window_change_preview(
  uuid, text, boolean, timestamptz, timestamptz
) to authenticated, service_role;

create or replace function public.studio2_apply_next_in_line_window_change(
  p_edition_id uuid,
  p_target_status text,
  p_enabled boolean,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_window public.studio2_next_in_line_windows;
  v_current_status text;
  v_target text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_risk text;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('next_in_line.manage', p_edition_id, false) then
    raise exception 'Missing Solaris capability: next_in_line.manage'
      using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A Next in Line change reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  select *
  into v_window
  from public.studio2_next_in_line_windows
  where edition_id = p_edition_id
  for update;

  v_current_status := coalesce(v_nil_window.status, 'draft');

  if coalesce(v_window.version, 0) is distinct from p_expected_version then
    raise exception 'Next in Line state changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  perform public.studio2_next_in_line_window_change_preview(
    p_edition_id,
    v_target,
    p_enabled,
    p_opens_at,
    p_closes_at
  );

  v_risk := case when v_target in ('open', 'closed', 'cancelled') then 'R2' else 'R1' end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'next_in_line.window.' || v_target,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'fromStatus', v_current_status,
      'toStatus', v_target,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_nil_window.edition_id is null then
    insert into public.studio2_next_in_line_windows (
      edition_id,
      enabled,
      status,
      opens_at,
      closes_at,
      version,
      reason,
      changed_by,
      changed_at
    )
    values (
      p_edition_id,
      p_enabled,
      v_target,
      case when v_target = 'open' and p_opens_at is null then now() else p_opens_at end,
      p_closes_at,
      1,
      v_reason,
      auth.uid(),
      now()
    )
    returning * into v_window;
  else
    update public.studio2_next_in_line_windows
    set
      enabled = p_enabled,
      status = v_target,
      opens_at = case
        when v_target = 'open' and p_opens_at is null then now()
        else p_opens_at
      end,
      closes_at = p_closes_at,
      version = version + 1,
      reason = v_reason,
      changed_by = auth.uid(),
      changed_at = now()
    where edition_id = p_edition_id
    returning * into v_window;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'next_in_line_window_changed',
    'studio2_next_in_line_windows',
    p_edition_id::text,
    jsonb_build_object(
      'status', v_current_status,
      'version', p_expected_version
    ),
    jsonb_build_object(
      'status', v_nil_window.status,
      'enabled', v_nil_window.enabled,
      'opensAt', v_nil_window.opens_at,
      'closesAt', v_nil_window.closes_at,
      'version', v_window.version,
      'reason', v_window.reason,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'status', v_nil_window.status,
    'enabled', v_nil_window.enabled,
    'opensAt', v_nil_window.opens_at,
    'closesAt', v_nil_window.closes_at,
    'version', v_window.version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_next_in_line_window_change(
  uuid, text, boolean, timestamptz, timestamptz, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_next_in_line_window_change(
  uuid, text, boolean, timestamptz, timestamptz, text, uuid, text, bigint
) to authenticated, service_role;

create or replace function public.public_next_in_line_countries()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $countries$
declare
  v_window public.studio2_next_in_line_windows;
  v_edition public.editions;
begin
  select *
  into v_window
  from public.studio2_next_in_line_windows nil_window
  where nil_window.enabled = true
    and nil_window.status = 'open'
    and (nil_window.opens_at is null or nil_window.opens_at <= now())
    and (nil_window.closes_at is null or nil_window.closes_at > now())
  order by nil_window.changed_at desc
  limit 1;

  if v_nil_window.edition_id is null then
    return jsonb_build_object('ok', false, 'error', 'closed', 'countries', '[]'::jsonb);
  end if;

  select * into v_edition
  from public.editions
  where id = v_nil_window.edition_id;

  return jsonb_build_object(
    'ok', true,
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'edition_number', v_edition.edition_number
    ),
    'countries', coalesce((
      select jsonb_agg(
        jsonb_build_object('country', source.country)
        order by source.country
      )
      from public.submissions source
      where source.edition_id = v_nil_window.edition_id
        and private.studio2_next_in_line_source_eligible(source.id)
    ), '[]'::jsonb)
  );
end
$countries$;

revoke all on function public.public_next_in_line_countries() from public;
grant execute on function public.public_next_in_line_countries()
  to anon, authenticated, service_role;

create or replace function public.public_next_in_line_country(
  _edition_id uuid,
  _country text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $country$
declare
  v_submission public.submissions;
begin
  if not private.studio2_next_in_line_window_is_open(_edition_id) then
    return jsonb_build_object('ok', false, 'error', 'closed', 'entries', '[]'::jsonb);
  end if;

  select *
  into v_submission
  from public.submissions submission
  where submission.edition_id = _edition_id
    and lower(btrim(submission.country)) = lower(btrim(_country))
    and private.studio2_next_in_line_source_eligible(submission.id)
  order by submission.updated_at desc, submission.submitted_at desc
  limit 1;

  if v_submission.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_eligible', 'entries', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_submission.id,
    'country', v_submission.country,
    'selection_method', v_submission.selection_method,
    'entries',
      case
        when v_submission.selection_method = 'national_final' then coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', entry.id,
              'artist', entry.artist,
              'song_title', entry.song_title,
              'song_url', entry.song_url,
              'position', entry.position
            )
            order by entry.position, entry.id
          )
          from public.national_finals nf
          join public.national_final_entries entry
            on entry.national_final_id = nf.id
          where nf.submission_id = v_submission.id
            and entry.review_status = 'accepted'
            and coalesce(entry.removed, false) = false
            and entry.id is distinct from nf.winning_entry_id
        ), '[]'::jsonb)
        else '[]'::jsonb
      end
  );
end
$country$;

revoke all on function public.public_next_in_line_country(uuid, text) from public;
grant execute on function public.public_next_in_line_country(uuid, text)
  to anon, authenticated, service_role;

create or replace function public.submit_next_in_line(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $submit$
declare
  v_edition_id uuid;
  v_source_submission_id uuid;
  v_country text;
  v_selection_type text;
  v_nf_entry_id uuid;
  v_artist text;
  v_song text;
  v_url text;
  v_preview_start text;
  v_preview_end text;
  v_source public.submissions;
  v_country_row public.countries;
  v_nf_entry public.national_final_entries;
  v_existing_id uuid;
begin
  if jsonb_typeof(coalesce(payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid Next in Line payload' using errcode = '22023';
  end if;

  begin
    v_edition_id := nullif(payload ->> 'edition_id', '')::uuid;
    v_source_submission_id := nullif(payload ->> 'source_submission_id', '')::uuid;
    v_nf_entry_id := nullif(payload ->> 'national_final_entry_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid Next in Line identifiers' using errcode = '22023';
  end;

  v_country := btrim(coalesce(payload ->> 'country', ''));
  v_selection_type := lower(btrim(coalesce(payload ->> 'selection_type', '')));
  v_artist := nullif(btrim(coalesce(payload ->> 'artist', '')), '');
  v_song := nullif(btrim(coalesce(payload ->> 'song_title', '')), '');
  v_url := nullif(btrim(coalesce(payload ->> 'song_url', '')), '');
  v_preview_start := nullif(btrim(coalesce(payload ->> 'preview_start', '')), '');
  v_preview_end := nullif(btrim(coalesce(payload ->> 'preview_end', '')), '');

  if v_edition_id is null or v_source_submission_id is null or v_country = '' then
    raise exception 'Next in Line edition, source submission and country are required'
      using errcode = '22023';
  end if;
  if not private.studio2_next_in_line_window_is_open(v_edition_id) then
    raise exception 'Next in Line is closed' using errcode = '22023';
  end if;
  if v_preview_start is null or v_preview_end is null then
    raise exception 'preview_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-next-in-line:' || v_source_submission_id::text, 0)
  );

  select *
  into v_source
  from public.submissions submission
  where submission.id = v_source_submission_id
    and submission.edition_id = v_edition_id
    and lower(btrim(submission.country)) = lower(btrim(v_country))
  for update;

  if v_source.id is null
     or not private.studio2_next_in_line_source_eligible(v_source.id) then
    raise exception 'Next in Line source is not eligible' using errcode = '42501';
  end if;

  select country_row.*
  into v_country_row
  from public.countries country_row
  where lower(btrim(v_source.country)) in (
    lower(btrim(country_row.name)),
    lower(btrim(country_row.short_code))
  )
  limit 1;

  if v_country_row.id is null then
    raise exception 'Country identity could not be resolved' using errcode = '22023';
  end if;

  if v_selection_type = 'national_final' then
    select entry.*
    into v_nf_entry
    from public.national_finals nf
    join public.national_final_entries entry
      on entry.national_final_id = nf.id
    where nf.submission_id = v_source.id
      and entry.id = v_nf_entry_id
      and entry.review_status = 'accepted'
      and coalesce(entry.removed, false) = false
      and entry.id is distinct from nf.winning_entry_id;

    if v_nf_entry.id is null then
      raise exception 'invalid_nf_entry' using errcode = '22023';
    end if;

    v_artist := nullif(btrim(v_nf_entry.artist), '');
    v_song := nullif(btrim(v_nf_entry.song_title), '');
    v_url := nullif(btrim(v_nf_entry.song_url), '');
  elsif v_selection_type = 'internal' then
    if v_artist is null or v_song is null then
      raise exception 'Artist and song title are required for an internal-selection alternative'
        using errcode = '22023';
    end if;
    v_nf_entry_id := null;
  else
    raise exception 'Next in Line selection type must be internal or national_final'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception 'duplicate_song' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.country_id <> v_country_row.id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.artist)
          = private.studio2_next_in_line_normalize(v_artist)
  ) then
    raise exception 'duplicate_artist' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.next_in_line_submissions nil
    where nil.edition_id = v_edition_id
      and nil.source_submission_id <> v_source_submission_id
      and nil.participating = true
      and private.studio2_next_in_line_normalize(nil.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception 'duplicate_song' using errcode = '23505';
  end if;

  select nil.id
  into v_existing_id
  from public.next_in_line_submissions nil
  where nil.edition_id = v_edition_id
    and nil.source_submission_id = v_source_submission_id
  order by nil.submitted_at desc, nil.id
  limit 1
  for update;

  if v_existing_id is null then
    insert into public.next_in_line_submissions (
      edition_id,
      source_submission_id,
      country,
      participating,
      entry_unknown,
      selection_type,
      national_final_entry_id,
      artist,
      song_title,
      song_url,
      preview_start,
      preview_end,
      submitted_at
    )
    values (
      v_edition_id,
      v_source_submission_id,
      v_source.country,
      true,
      false,
      v_selection_type,
      v_nf_entry_id,
      v_artist,
      v_song,
      v_url,
      v_preview_start,
      v_preview_end,
      now()
    )
    returning id into v_existing_id;
  else
    update public.next_in_line_submissions
    set
      country = v_source.country,
      participating = true,
      entry_unknown = false,
      selection_type = v_selection_type,
      national_final_entry_id = v_nf_entry_id,
      artist = v_artist,
      song_title = v_song,
      song_url = v_url,
      preview_start = v_preview_start,
      preview_end = v_preview_end,
      submitted_at = now()
    where id = v_existing_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_existing_id,
    'edition_id', v_edition_id,
    'source_submission_id', v_source_submission_id
  );
end
$submit$;

revoke all on function public.submit_next_in_line(jsonb) from public;
grant execute on function public.submit_next_in_line(jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

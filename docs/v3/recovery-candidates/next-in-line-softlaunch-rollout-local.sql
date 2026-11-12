-- LOCAL-ONLY REVIEW CANDIDATE. NOT A TRACKED MIGRATION, NOT A PRODUCTION ACTION.
-- Source: supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql at 395c9a42a1bdddcd0200443bf40723f4b8a968d2
-- Existing actor/delegation/window/receipt writer is preserved unchanged except
-- for a feature rollout check before claim or DML; legacy adapter delegates here.
-- 'next_in_line' is deliberately not seeded by this file: absent rule = denied.
-- System owner must independently approve this key/policy and run isolated
-- PG17 + hosted-equivalent negative/positive cases before any production plan.
begin;

-- A feature key cannot be enabled if the existing guarded whitelist rejects it.
-- Extend ONLY the existing key check, preserving every other key condition verbatim.
-- This is still local-only and does not insert or enable a rollout decision.
do $allow_key$
declare
  v_definition text;
  v_expression text;
begin
  select pg_get_constraintdef(c.oid)
  into v_definition
  from pg_constraint c
  where c.conrelid = 'public.studio2_feature_flags'::regclass
    and c.conname = 'studio2_feature_flags_key_check'
    and c.contype = 'c';
  if v_definition is null then
    raise exception 'Missing canonical feature flag whitelist';
  end if;
  v_expression := substring(v_definition from '^CHECK \\((.*)\\)do $preflight$
declare
  v_existing text;
begin
  if to_regprocedure('public.v3_submit_next_in_line(jsonb,uuid,text)') is null
     or to_regprocedure('private.studio2_feature_enabled_for(uuid,text,uuid)') is null then
    raise exception 'Missing canonical Next in Line command or existing rollout authority';
  end if;
  v_existing := pg_get_functiondef('public.v3_submit_next_in_line(jsonb,uuid,text)'::regprocedure);
  if position('private.v3_next_in_line_actor_controls_country' in v_existing) = 0
     or position('private.studio2_next_in_line_window_is_open' in v_existing) = 0
     or position('private.studio2_claim_operation' in v_existing) = 0
     or position('studio2_feature_enabled_for' in v_existing) > 0 then
    raise exception 'Unexpected canonical Next in Line source; review required';
  end if;
end
$preflight$;

create or replace function public.v3_submit_next_in_line(
  payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $submit$
declare
  v_actor uuid := auth.uid();
  v_edition_id uuid;
  v_source_submission_id uuid;
  v_requested_country text;
  v_selection_type text;
  v_nf_entry_id uuid;
  v_artist text;
  v_song text;
  v_url text;
  v_preview_start text;
  v_preview_end text;
  v_source public.submissions;
  v_country_id uuid;
  v_country public.countries;
  v_nf_entry public.national_final_entries;
  v_existing public.next_in_line_submissions;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_semantic_request jsonb;
  v_result jsonb;
  v_new_revision bigint;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if payload - array[
    'edition_id',
    'source_submission_id',
    'country',
    'participating',
    'entry_unknown',
    'selection_type',
    'national_final_entry_id',
    'artist',
    'song_title',
    'song_url',
    'preview_start',
    'preview_end'
  ]::text[] <> '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      hint = 'Next in Line payload contains unsupported fields.';
  end if;

  begin
    v_edition_id := nullif(payload ->> 'edition_id', '')::uuid;
    v_source_submission_id := nullif(payload ->> 'source_submission_id', '')::uuid;
    v_nf_entry_id := nullif(payload ->> 'national_final_entry_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end;

  v_requested_country := nullif(btrim(coalesce(payload ->> 'country', '')), '');
  v_selection_type := lower(btrim(coalesce(payload ->> 'selection_type', '')));
  v_artist := nullif(btrim(coalesce(payload ->> 'artist', '')), '');
  v_song := nullif(btrim(coalesce(payload ->> 'song_title', '')), '');
  v_url := nullif(btrim(coalesce(payload ->> 'song_url', '')), '');
  v_preview_start := nullif(btrim(coalesce(payload ->> 'preview_start', '')), '');
  v_preview_end := nullif(btrim(coalesce(payload ->> 'preview_end', '')), '');

  if v_edition_id is null or v_source_submission_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if (v_requested_country is not null and length(v_requested_country) > 80)
     or (v_artist is not null and length(v_artist) > 160)
     or (v_song is not null and length(v_song) > 160)
     or (v_url is not null and length(v_url) > 500)
     or (v_preview_start is not null and length(v_preview_start) > 10)
     or (v_preview_end is not null and length(v_preview_end) > 10) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_preview_start is null or v_preview_end is null then
    raise exception using errcode = '22023', message = 'VALIDATION', hint = 'preview_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-next-in-line:' || v_source_submission_id::text, 0)
  );

  select source.*
  into v_source
  from public.submissions source
  where source.id = v_source_submission_id
    and source.edition_id = v_edition_id
  for update;

  if v_source.id is null
     or not private.studio2_next_in_line_source_eligible(v_source.id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_country_id := private.v3_next_in_line_country_for_source(
    v_edition_id,
    v_source_submission_id
  );

  if v_country_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select country_row.*
  into v_country
  from public.countries country_row
  where country_row.id = v_country_id;

  -- Browser country/edition/source values are selectors only. The write is
  -- authorized against canonical source -> country -> current actor ownership.
  if v_requested_country is not null
     and lower(btrim(v_requested_country)) not in (
       lower(btrim(v_source.country)),
       lower(btrim(v_country.name)),
       lower(btrim(v_country.short_code))
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if not private.v3_next_in_line_actor_controls_country(
    v_actor,
    v_edition_id,
    v_country_id
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_BEGIN
  -- Domain window and role checks do not authorize a deferred product rollout.
  -- The source row, not an untrusted payload edition, selects the flag context.
  if not private.studio2_feature_enabled_for(
    v_actor,
    'next_in_line',
    v_source.edition_id
  ) then
    raise exception using errcode = '42501', message = 'FEATURE_UNAVAILABLE';
  end if;
  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_END

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
      raise exception using errcode = '22023', message = 'VALIDATION', hint = 'invalid_nf_entry';
    end if;

    v_artist := nullif(btrim(v_nf_entry.artist), '');
    v_song := nullif(btrim(v_nf_entry.song_title), '');
    v_url := nullif(btrim(v_nf_entry.song_url), '');
  elsif v_selection_type = 'internal' then
    if v_artist is null or v_song is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_nf_entry_id := null;
  else
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_semantic_request := jsonb_build_object(
    'editionId', v_edition_id,
    'sourceSubmissionId', v_source_submission_id,
    'countryId', v_country_id,
    'selectionType', v_selection_type,
    'nationalFinalEntryId', v_nf_entry_id,
    'artist', v_artist,
    'songTitle', v_song,
    'songUrl', v_url,
    'previewStart', v_preview_start,
    'previewEnd', v_preview_end
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'next_in_line.submit',
    'R1',
    jsonb_build_object(
      'editionId', v_edition_id,
      'countryId', v_country_id,
      'sourceSubmissionId', v_source_submission_id
    ),
    v_semantic_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'correlationId', v_claim ->> 'correlationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if not private.studio2_next_in_line_window_is_open(v_edition_id) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED', hint = 'Next in Line is closed.';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_song';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.country_id <> v_country_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.artist)
          = private.studio2_next_in_line_normalize(v_artist)
  ) then
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_artist';
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
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_song';
  end if;

  select nil.*
  into v_existing
  from public.next_in_line_submissions nil
  where nil.edition_id = v_edition_id
    and nil.source_submission_id = v_source_submission_id
  for update;

  -- A new operation carrying identical canonical content is a no-op against
  -- the submission revision, but it still receives a durable successful receipt.
  if v_existing.id is not null
     and v_existing.country is not distinct from v_source.country
     and v_existing.participating is true
     and v_existing.entry_unknown is false
     and v_existing.selection_type is not distinct from v_selection_type
     and v_existing.national_final_entry_id is not distinct from v_nf_entry_id
     and v_existing.artist is not distinct from v_artist
     and v_existing.song_title is not distinct from v_song
     and v_existing.song_url is not distinct from v_url
     and v_existing.preview_start is not distinct from v_preview_start
     and v_existing.preview_end is not distinct from v_preview_end then

    update public.next_in_line_submissions
    set last_operation_id = v_canonical_operation_id
    where id = v_existing.id
    returning * into v_existing;

    v_result := jsonb_build_object(
      'ok', true,
      'submission_id', v_existing.id,
      'edition_id', v_edition_id,
      'source_submission_id', v_source_submission_id,
      'country_id', v_country_id,
      'revision', v_existing.revision,
      'submitted_at', v_existing.submitted_at,
      'updatedAt', v_existing.updated_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false,
      'unchanged', true
    );

    return private.studio2_complete_operation(v_canonical_operation_id, v_result);
  end if;

  if v_existing.id is null then
    v_new_revision := 1;

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
      submitted_at,
      revision,
      updated_at,
      submitted_by,
      last_operation_id
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
      v_now,
      v_new_revision,
      v_now,
      v_actor,
      v_canonical_operation_id
    )
    returning * into v_existing;
  else
    v_new_revision := v_existing.revision + 1;

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
      submitted_at = v_now,
      revision = v_new_revision,
      updated_at = v_now,
      submitted_by = v_actor,
      last_operation_id = v_canonical_operation_id
    where id = v_existing.id
    returning * into v_existing;
  end if;

  insert into public.studio2_next_in_line_submission_revisions (
    submission_id,
    revision,
    operation_id,
    snapshot,
    created_at
  )
  values (
    v_existing.id,
    v_existing.revision,
    v_canonical_operation_id,
    jsonb_build_object(
      'editionId', v_existing.edition_id,
      'sourceSubmissionId', v_existing.source_submission_id,
      'countryId', v_country_id,
      'country', v_existing.country,
      'selectionType', v_existing.selection_type,
      'nationalFinalEntryId', v_existing.national_final_entry_id,
      'artist', v_existing.artist,
      'songTitle', v_existing.song_title,
      'songUrl', v_existing.song_url,
      'previewStart', v_existing.preview_start,
      'previewEnd', v_existing.preview_end,
      'submittedAt', v_existing.submitted_at
    ),
    v_now
  );

  v_result := jsonb_build_object(
    'ok', true,
    'submission_id', v_existing.id,
    'edition_id', v_edition_id,
    'source_submission_id', v_source_submission_id,
    'country_id', v_country_id,
    'revision', v_existing.revision,
    'submitted_at', v_existing.submitted_at,
    'updatedAt', v_existing.updated_at,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'replayed', false,
    'unchanged', false
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$submit$;

-- Retain existing browser EXECUTE ACL and legacy adapter, without broadening
-- permissions or introducing a second mutation path.
revoke all on function public.v3_submit_next_in_line(jsonb, uuid, text)
  from public, anon;
grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)
  to authenticated;

commit;
);
  if v_expression is null
     or position('key' in v_expression) = 0
     or position('next_in_line' in v_expression) > 0 then
    raise exception 'Unexpected feature flag whitelist; System review required';
  end if;
  alter table public.studio2_feature_flags
    drop constraint studio2_feature_flags_key_check;
  execute format(
    'alter table public.studio2_feature_flags add constraint studio2_feature_flags_key_check check ((%s) or key = %L)',
    v_expression,
    'next_in_line'
  );
end
$allow_key$;

do $preflight$
declare
  v_existing text;
begin
  if to_regprocedure('public.v3_submit_next_in_line(jsonb,uuid,text)') is null
     or to_regprocedure('private.studio2_feature_enabled_for(uuid,text,uuid)') is null then
    raise exception 'Missing canonical Next in Line command or existing rollout authority';
  end if;
  v_existing := pg_get_functiondef('public.v3_submit_next_in_line(jsonb,uuid,text)'::regprocedure);
  if position('private.v3_next_in_line_actor_controls_country' in v_existing) = 0
     or position('private.studio2_next_in_line_window_is_open' in v_existing) = 0
     or position('private.studio2_claim_operation' in v_existing) = 0
     or position('studio2_feature_enabled_for' in v_existing) > 0 then
    raise exception 'Unexpected canonical Next in Line source; review required';
  end if;
end
$preflight$;

create or replace function public.v3_submit_next_in_line(
  payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $submit$
declare
  v_actor uuid := auth.uid();
  v_edition_id uuid;
  v_source_submission_id uuid;
  v_requested_country text;
  v_selection_type text;
  v_nf_entry_id uuid;
  v_artist text;
  v_song text;
  v_url text;
  v_preview_start text;
  v_preview_end text;
  v_source public.submissions;
  v_country_id uuid;
  v_country public.countries;
  v_nf_entry public.national_final_entries;
  v_existing public.next_in_line_submissions;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_semantic_request jsonb;
  v_result jsonb;
  v_new_revision bigint;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if payload - array[
    'edition_id',
    'source_submission_id',
    'country',
    'participating',
    'entry_unknown',
    'selection_type',
    'national_final_entry_id',
    'artist',
    'song_title',
    'song_url',
    'preview_start',
    'preview_end'
  ]::text[] <> '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      hint = 'Next in Line payload contains unsupported fields.';
  end if;

  begin
    v_edition_id := nullif(payload ->> 'edition_id', '')::uuid;
    v_source_submission_id := nullif(payload ->> 'source_submission_id', '')::uuid;
    v_nf_entry_id := nullif(payload ->> 'national_final_entry_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end;

  v_requested_country := nullif(btrim(coalesce(payload ->> 'country', '')), '');
  v_selection_type := lower(btrim(coalesce(payload ->> 'selection_type', '')));
  v_artist := nullif(btrim(coalesce(payload ->> 'artist', '')), '');
  v_song := nullif(btrim(coalesce(payload ->> 'song_title', '')), '');
  v_url := nullif(btrim(coalesce(payload ->> 'song_url', '')), '');
  v_preview_start := nullif(btrim(coalesce(payload ->> 'preview_start', '')), '');
  v_preview_end := nullif(btrim(coalesce(payload ->> 'preview_end', '')), '');

  if v_edition_id is null or v_source_submission_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if (v_requested_country is not null and length(v_requested_country) > 80)
     or (v_artist is not null and length(v_artist) > 160)
     or (v_song is not null and length(v_song) > 160)
     or (v_url is not null and length(v_url) > 500)
     or (v_preview_start is not null and length(v_preview_start) > 10)
     or (v_preview_end is not null and length(v_preview_end) > 10) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_preview_start is null or v_preview_end is null then
    raise exception using errcode = '22023', message = 'VALIDATION', hint = 'preview_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-next-in-line:' || v_source_submission_id::text, 0)
  );

  select source.*
  into v_source
  from public.submissions source
  where source.id = v_source_submission_id
    and source.edition_id = v_edition_id
  for update;

  if v_source.id is null
     or not private.studio2_next_in_line_source_eligible(v_source.id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_country_id := private.v3_next_in_line_country_for_source(
    v_edition_id,
    v_source_submission_id
  );

  if v_country_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select country_row.*
  into v_country
  from public.countries country_row
  where country_row.id = v_country_id;

  -- Browser country/edition/source values are selectors only. The write is
  -- authorized against canonical source -> country -> current actor ownership.
  if v_requested_country is not null
     and lower(btrim(v_requested_country)) not in (
       lower(btrim(v_source.country)),
       lower(btrim(v_country.name)),
       lower(btrim(v_country.short_code))
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if not private.v3_next_in_line_actor_controls_country(
    v_actor,
    v_edition_id,
    v_country_id
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_BEGIN
  -- Domain window and role checks do not authorize a deferred product rollout.
  -- The source row, not an untrusted payload edition, selects the flag context.
  if not private.studio2_feature_enabled_for(
    v_actor,
    'next_in_line',
    v_source.edition_id
  ) then
    raise exception using errcode = '42501', message = 'FEATURE_UNAVAILABLE';
  end if;
  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_END

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
      raise exception using errcode = '22023', message = 'VALIDATION', hint = 'invalid_nf_entry';
    end if;

    v_artist := nullif(btrim(v_nf_entry.artist), '');
    v_song := nullif(btrim(v_nf_entry.song_title), '');
    v_url := nullif(btrim(v_nf_entry.song_url), '');
  elsif v_selection_type = 'internal' then
    if v_artist is null or v_song is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_nf_entry_id := null;
  else
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_semantic_request := jsonb_build_object(
    'editionId', v_edition_id,
    'sourceSubmissionId', v_source_submission_id,
    'countryId', v_country_id,
    'selectionType', v_selection_type,
    'nationalFinalEntryId', v_nf_entry_id,
    'artist', v_artist,
    'songTitle', v_song,
    'songUrl', v_url,
    'previewStart', v_preview_start,
    'previewEnd', v_preview_end
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'next_in_line.submit',
    'R1',
    jsonb_build_object(
      'editionId', v_edition_id,
      'countryId', v_country_id,
      'sourceSubmissionId', v_source_submission_id
    ),
    v_semantic_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'replayed', true,
      'operationId', v_claim ->> 'operationId',
      'correlationId', v_claim ->> 'correlationId',
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error'
    );
  end if;

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  if not private.studio2_next_in_line_window_is_open(v_edition_id) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED', hint = 'Next in Line is closed.';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.song_title)
          = private.studio2_next_in_line_normalize(v_song)
  ) then
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_song';
  end if;

  if exists (
    select 1
    from public.entries official
    where official.edition_id = v_edition_id
      and official.country_id <> v_country_id
      and official.status not in ('withdrawn', 'disqualified')
      and private.studio2_next_in_line_normalize(official.artist)
          = private.studio2_next_in_line_normalize(v_artist)
  ) then
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_artist';
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
    raise exception using errcode = '23505', message = 'VALIDATION', hint = 'duplicate_song';
  end if;

  select nil.*
  into v_existing
  from public.next_in_line_submissions nil
  where nil.edition_id = v_edition_id
    and nil.source_submission_id = v_source_submission_id
  for update;

  -- A new operation carrying identical canonical content is a no-op against
  -- the submission revision, but it still receives a durable successful receipt.
  if v_existing.id is not null
     and v_existing.country is not distinct from v_source.country
     and v_existing.participating is true
     and v_existing.entry_unknown is false
     and v_existing.selection_type is not distinct from v_selection_type
     and v_existing.national_final_entry_id is not distinct from v_nf_entry_id
     and v_existing.artist is not distinct from v_artist
     and v_existing.song_title is not distinct from v_song
     and v_existing.song_url is not distinct from v_url
     and v_existing.preview_start is not distinct from v_preview_start
     and v_existing.preview_end is not distinct from v_preview_end then

    update public.next_in_line_submissions
    set last_operation_id = v_canonical_operation_id
    where id = v_existing.id
    returning * into v_existing;

    v_result := jsonb_build_object(
      'ok', true,
      'submission_id', v_existing.id,
      'edition_id', v_edition_id,
      'source_submission_id', v_source_submission_id,
      'country_id', v_country_id,
      'revision', v_existing.revision,
      'submitted_at', v_existing.submitted_at,
      'updatedAt', v_existing.updated_at,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'replayed', false,
      'unchanged', true
    );

    return private.studio2_complete_operation(v_canonical_operation_id, v_result);
  end if;

  if v_existing.id is null then
    v_new_revision := 1;

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
      submitted_at,
      revision,
      updated_at,
      submitted_by,
      last_operation_id
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
      v_now,
      v_new_revision,
      v_now,
      v_actor,
      v_canonical_operation_id
    )
    returning * into v_existing;
  else
    v_new_revision := v_existing.revision + 1;

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
      submitted_at = v_now,
      revision = v_new_revision,
      updated_at = v_now,
      submitted_by = v_actor,
      last_operation_id = v_canonical_operation_id
    where id = v_existing.id
    returning * into v_existing;
  end if;

  insert into public.studio2_next_in_line_submission_revisions (
    submission_id,
    revision,
    operation_id,
    snapshot,
    created_at
  )
  values (
    v_existing.id,
    v_existing.revision,
    v_canonical_operation_id,
    jsonb_build_object(
      'editionId', v_existing.edition_id,
      'sourceSubmissionId', v_existing.source_submission_id,
      'countryId', v_country_id,
      'country', v_existing.country,
      'selectionType', v_existing.selection_type,
      'nationalFinalEntryId', v_existing.national_final_entry_id,
      'artist', v_existing.artist,
      'songTitle', v_existing.song_title,
      'songUrl', v_existing.song_url,
      'previewStart', v_existing.preview_start,
      'previewEnd', v_existing.preview_end,
      'submittedAt', v_existing.submitted_at
    ),
    v_now
  );

  v_result := jsonb_build_object(
    'ok', true,
    'submission_id', v_existing.id,
    'edition_id', v_edition_id,
    'source_submission_id', v_source_submission_id,
    'country_id', v_country_id,
    'revision', v_existing.revision,
    'submitted_at', v_existing.submitted_at,
    'updatedAt', v_existing.updated_at,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'replayed', false,
    'unchanged', false
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$submit$;

-- Retain existing browser EXECUTE ACL and legacy adapter, without broadening
-- permissions or introducing a second mutation path.
revoke all on function public.v3_submit_next_in_line(jsonb, uuid, text)
  from public, anon;
grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)
  to authenticated;

commit;

begin;

-- Solaris Studio V3 S7/S8: close the participant object-authorization gap on
-- Next in Line while retaining the existing server-authoritative eligibility
-- rules. This migration also folds in the still-unmerged S8 replay/resource
-- protections so one clean current-main contract owns the mutation boundary.

create unique index if not exists next_in_line_submissions_edition_source_v3_uidx
  on public.next_in_line_submissions (edition_id, source_submission_id);

alter table public.next_in_line_submissions
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists last_operation_id uuid references public.studio2_operation_receipts(operation_id) on delete set null;

alter table public.next_in_line_submissions
  add constraint next_in_line_submissions_revision_v3_check
    check (revision > 0) not valid,
  add constraint next_in_line_submissions_country_length_v3_check
    check (length(country) between 1 and 80) not valid,
  add constraint next_in_line_submissions_artist_length_v3_check
    check (artist is null or length(artist) <= 160) not valid,
  add constraint next_in_line_submissions_song_length_v3_check
    check (song_title is null or length(song_title) <= 160) not valid,
  add constraint next_in_line_submissions_url_length_v3_check
    check (song_url is null or length(song_url) <= 500) not valid,
  add constraint next_in_line_submissions_preview_start_length_v3_check
    check (preview_start is null or length(preview_start) <= 10) not valid,
  add constraint next_in_line_submissions_preview_end_length_v3_check
    check (preview_end is null or length(preview_end) <= 10) not valid;

alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_revision_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_country_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_artist_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_song_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_url_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_preview_start_length_v3_check;
alter table public.next_in_line_submissions
  validate constraint next_in_line_submissions_preview_end_length_v3_check;

-- Immutable revision evidence. Browser roles never access this table directly;
-- participant reads are projected through v3_my_next_in_line().
create table if not exists public.studio2_next_in_line_submission_revisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.next_in_line_submissions(id) on delete cascade,
  revision bigint not null check (revision > 0),
  operation_id uuid references public.studio2_operation_receipts(operation_id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (submission_id, revision),
  constraint studio2_next_in_line_revision_snapshot_v3_check
    check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 32768)
);

create index if not exists studio2_next_in_line_revisions_submission_time_idx
  on public.studio2_next_in_line_submission_revisions (submission_id, revision desc, created_at desc);

alter table public.studio2_next_in_line_submission_revisions enable row level security;
revoke all on table public.studio2_next_in_line_submission_revisions
  from public, anon, authenticated;
grant all on table public.studio2_next_in_line_submission_revisions to service_role;

-- Direct browser writes are not an authority boundary. Keep any intentionally
-- existing read grants intact, but force writes through the authenticated RPC.
revoke insert, update, delete on table public.next_in_line_submissions
  from anon, authenticated;

create or replace function private.v3_next_in_line_actor_controls_country(
  p_actor uuid,
  p_edition_id uuid,
  p_country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select
    p_actor is not null
    and p_edition_id is not null
    and p_country_id is not null
    and exists (
      select 1
      from public.country_accounts account
      where account.user_id = p_actor
        and account.country_id = p_country_id
        and account.status = 'active'
    )
    and exists (
      select 1
      from public.participants participant
      where participant.edition_id = p_edition_id
        and participant.country_id = p_country_id
    )
    and (
      exists (
        select 1
        from public.country_hod_edition_claims claim
        where claim.user_id = p_actor
          and claim.country_id = p_country_id
          and claim.edition_id = p_edition_id
          and claim.status = 'mine'
      )
      or (
        not exists (
          select 1
          from public.country_hod_edition_claims explicit_claim
          where explicit_claim.user_id = p_actor
            and explicit_claim.country_id = p_country_id
            and explicit_claim.edition_id = p_edition_id
        )
        and exists (
          select 1
          from public.delegation_hod_assignments assignment
          join public.delegation_people person
            on person.id = assignment.person_id
          where assignment.edition_id = p_edition_id
            and assignment.country_id = p_country_id
            and assignment.channel = 'delegation'
            and person.identity_key = 'account:' || p_actor::text
        )
      )
    );
$allowed$;

revoke all on function private.v3_next_in_line_actor_controls_country(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_next_in_line_country_for_source(
  p_edition_id uuid,
  p_source_submission_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $country$
  select country_row.id
  from public.submissions source
  join lateral (
    select c.id
    from public.countries c
    where lower(btrim(source.country)) in (
      lower(btrim(c.name)),
      lower(btrim(c.short_code))
    )
    order by case when lower(btrim(source.country)) = lower(btrim(c.name)) then 0 else 1 end, c.id
    limit 1
  ) country_row on true
  where source.id = p_source_submission_id
    and source.edition_id = p_edition_id;
$country$;

revoke all on function private.v3_next_in_line_country_for_source(uuid, uuid)
  from public, anon, authenticated;

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

revoke all on function public.v3_submit_next_in_line(jsonb, uuid, text)
  from public, anon;
grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)
  to authenticated;

comment on function public.v3_submit_next_in_line(jsonb, uuid, text) is
  'Authenticated V3 Next in Line command. Country authority is derived from canonical source/delegation state; idempotency and reconciliation use the S2 operation receipt.';

-- Compatibility adapter for the existing Public caller. It is intentionally no
-- longer anonymous. Identical legacy payloads derive the same actor-scoped
-- idempotency key and therefore reconcile to one canonical S2 operation.
create or replace function public.submit_next_in_line(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $legacy_submit$
declare
  v_actor uuid := auth.uid();
  v_key text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_key := 'legacy:' || encode(
    extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return public.v3_submit_next_in_line(
    payload,
    gen_random_uuid(),
    v_key
  );
end
$legacy_submit$;

revoke all on function public.submit_next_in_line(jsonb)
  from public, anon;
grant execute on function public.submit_next_in_line(jsonb)
  to authenticated;

comment on function public.submit_next_in_line(jsonb) is
  'Authenticated compatibility adapter. Anonymous Next in Line mutation is intentionally revoked by V3 S7.';

create or replace function public.v3_my_next_in_line(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_actor uuid := auth.uid();
  v_window public.studio2_next_in_line_windows;
  v_contexts jsonb := '[]'::jsonb;
  v_has_submission boolean := false;
  v_state text := 'unavailable';
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  select window_row.*
  into v_window
  from public.studio2_next_in_line_windows window_row
  where window_row.edition_id = p_edition_id;

  select coalesce(jsonb_agg(context_row.payload order by context_row.country_name, context_row.source_submission_id), '[]'::jsonb)
  into v_contexts
  from (
    select
      country_row.name as country_name,
      source.id as source_submission_id,
      jsonb_build_object(
        'country', jsonb_build_object(
          'id', country_row.id,
          'name', country_row.name,
          'shortCode', country_row.short_code
        ),
        'sourceSubmissionId', source.id,
        'selectionMethod', source.selection_method,
        'eligible', private.studio2_next_in_line_source_eligible(source.id),
        'candidates', case
          when source.selection_method = 'national_final' then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', entry.id,
                'artist', entry.artist,
                'songTitle', entry.song_title,
                'songUrl', entry.song_url,
                'position', entry.position
              )
              order by entry.position, entry.id
            )
            from public.national_finals nf
            join public.national_final_entries entry
              on entry.national_final_id = nf.id
            where nf.submission_id = source.id
              and entry.review_status = 'accepted'
              and coalesce(entry.removed, false) = false
              and entry.id is distinct from nf.winning_entry_id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end,
        'submission', case
          when current_submission.id is null then null
          else jsonb_build_object(
            'id', current_submission.id,
            'revision', current_submission.revision,
            'selectionType', current_submission.selection_type,
            'nationalFinalEntryId', current_submission.national_final_entry_id,
            'artist', current_submission.artist,
            'songTitle', current_submission.song_title,
            'songUrl', current_submission.song_url,
            'previewStart', current_submission.preview_start,
            'previewEnd', current_submission.preview_end,
            'submittedAt', current_submission.submitted_at,
            'updatedAt', current_submission.updated_at,
            'lastOperationId', current_submission.last_operation_id,
            'history', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'revision', revision_row.revision,
                  'operationId', revision_row.operation_id,
                  'createdAt', revision_row.created_at,
                  'snapshot', revision_row.snapshot
                )
                order by revision_row.revision desc
              )
              from public.studio2_next_in_line_submission_revisions revision_row
              where revision_row.submission_id = current_submission.id
            ), '[]'::jsonb),
            'lastOperation', case
              when receipt.operation_id is null then null
              else jsonb_build_object(
                'operationId', receipt.operation_id,
                'correlationId', receipt.correlation_id,
                'status', receipt.status,
                'createdAt', receipt.created_at,
                'updatedAt', receipt.updated_at,
                'completedAt', receipt.completed_at
              )
            end
          )
        end
      ) as payload
    from public.submissions source
    join lateral (
      select c.*
      from public.countries c
      where lower(btrim(source.country)) in (
        lower(btrim(c.name)),
        lower(btrim(c.short_code))
      )
      order by case when lower(btrim(source.country)) = lower(btrim(c.name)) then 0 else 1 end, c.id
      limit 1
    ) country_row on true
    left join public.next_in_line_submissions current_submission
      on current_submission.edition_id = source.edition_id
     and current_submission.source_submission_id = source.id
    left join public.studio2_operation_receipts receipt
      on receipt.operation_id = current_submission.last_operation_id
     and receipt.actor_id = v_actor
    where source.edition_id = p_edition_id
      and private.studio2_next_in_line_source_eligible(source.id)
      and private.v3_next_in_line_actor_controls_country(
        v_actor,
        p_edition_id,
        country_row.id
      )
  ) context_row;

  select exists (
    select 1
    from jsonb_array_elements(v_contexts) as context_item(value)
    where context_item.value -> 'submission' is not null
      and context_item.value -> 'submission' <> 'null'::jsonb
  ) into v_has_submission;

  if v_has_submission then
    v_state := 'submitted';
  elsif v_window.edition_id is null then
    v_state := 'unavailable';
  elsif v_window.status = 'scheduled'
        or (v_window.status = 'open' and v_window.opens_at is not null and v_window.opens_at > v_now) then
    v_state := 'upcoming';
  elsif private.studio2_next_in_line_window_is_open(p_edition_id) then
    v_state := 'open';
  elsif v_window.status in ('closed', 'cancelled') then
    v_state := v_window.status;
  elsif v_window.status = 'draft' then
    v_state := 'draft';
  else
    v_state := 'closed';
  end if;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'state', v_state,
    'window', case
      when v_window.edition_id is null then null
      else jsonb_build_object(
        'status', v_window.status,
        'enabled', v_window.enabled,
        'opensAt', v_window.opens_at,
        'closesAt', v_window.closes_at,
        'version', v_window.version,
        'effectiveOpen', private.studio2_next_in_line_window_is_open(p_edition_id)
      )
    end,
    'contexts', v_contexts,
    'serverTime', v_now
  );
end
$projection$;

revoke all on function public.v3_my_next_in_line(uuid)
  from public, anon;
grant execute on function public.v3_my_next_in_line(uuid)
  to authenticated;

comment on function public.v3_my_next_in_line(uuid) is
  'Authenticated participant Next in Line projection with canonical delegation scope, current submission, immutable revision evidence and last-operation reconciliation metadata.';

notify pgrst, 'reload schema';

commit;

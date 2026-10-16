begin;

-- System V3 P13: canonical structured Entry credits.
--
-- Confirmation remains the only participant Entry writer. Credits are injected
-- into the same Entry row before the existing immutable-version trigger captures
-- content, so a credit edit creates exactly one new Entry revision and therefore
-- invalidates any review bound to an older revision. Existing rows backfill to
-- an empty credit set without rewriting historical immutable evidence.

create or replace function private.v3_normalize_entry_credits(p_credits jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, private
as $normalize$
declare
  v_item jsonb;
  v_role text;
  v_name text;
  v_normalized jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_credits is null or p_credits = 'null'::jsonb then
    return '[]'::jsonb;
  end if;

  if jsonb_typeof(p_credits) <> 'array' then
    raise exception 'Entry credits must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_credits);
  if v_count > 32 then
    raise exception 'Entry credits may contain at most 32 records' using errcode = '54000';
  end if;

  for v_item in select value from jsonb_array_elements(p_credits)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each Entry credit must be an object' using errcode = '22023';
    end if;
    if (v_item - array['role', 'name']::text[]) <> '{}'::jsonb then
      raise exception 'Entry credit contains unsupported fields' using errcode = '22023';
    end if;

    v_role := lower(btrim(coalesce(v_item ->> 'role', '')));
    v_name := btrim(regexp_replace(coalesce(v_item ->> 'name', ''), '[[:space:]]+', ' ', 'g'));

    if v_role not in ('composer', 'lyricist', 'songwriter', 'producer', 'arranger', 'other') then
      raise exception 'Unknown Entry credit role: %', v_role using errcode = '22023';
    end if;
    if v_name = '' or char_length(v_name) > 160 then
      raise exception 'Entry credit name must contain 1 to 160 characters' using errcode = '22023';
    end if;

    if v_normalized @> jsonb_build_array(jsonb_build_object('role', v_role, 'name', v_name)) then
      raise exception 'Duplicate Entry credit: % / %', v_role, v_name using errcode = '22023';
    end if;

    v_normalized := v_normalized || jsonb_build_array(
      jsonb_build_object('role', v_role, 'name', v_name)
    );
  end loop;

  return v_normalized;
end
$normalize$;

revoke all on function private.v3_normalize_entry_credits(jsonb)
  from public, anon, authenticated;
grant execute on function private.v3_normalize_entry_credits(jsonb)
  to service_role;

alter table public.internal_entries
  add column if not exists credits jsonb not null default '[]'::jsonb;
alter table public.national_final_entries
  add column if not exists credits jsonb not null default '[]'::jsonb;

alter table public.internal_entries
  drop constraint if exists internal_entries_credits_canonical_check;
alter table public.internal_entries
  add constraint internal_entries_credits_canonical_check
  check (credits = private.v3_normalize_entry_credits(credits)) not valid;
alter table public.internal_entries
  validate constraint internal_entries_credits_canonical_check;

alter table public.national_final_entries
  drop constraint if exists national_final_entries_credits_canonical_check;
alter table public.national_final_entries
  add constraint national_final_entries_credits_canonical_check
  check (credits = private.v3_normalize_entry_credits(credits)) not valid;
alter table public.national_final_entries
  validate constraint national_final_entries_credits_canonical_check;

-- Preserve every pre-credits immutable content hash. Empty credit sets are not
-- added to the content object, so a legacy row with credits=[] hashes to exactly
-- the same JSONB shape as before this migration. The first non-empty credit set
-- naturally becomes part of the next immutable version.
create or replace function private.v3_entry_content(row_data jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, private
as $content$
  select jsonb_build_object(
    'artist', row_data->'artist',
    'song_title', row_data->'song_title',
    'song_url', row_data->'song_url',
    'preview_start', row_data->'preview_start',
    'preview_end', row_data->'preview_end',
    'final_clip_start', row_data->'final_clip_start',
    'final_clip_end', row_data->'final_clip_end',
    'replacement_video_required', row_data->'replacement_video_required',
    'replacement_video_url', row_data->'replacement_video_url'
  ) || case
    when jsonb_typeof(row_data->'credits') = 'array'
      and jsonb_array_length(row_data->'credits') > 0
      then jsonb_build_object('credits', private.v3_normalize_entry_credits(row_data->'credits'))
    else '{}'::jsonb
  end;
$content$;
revoke all on function private.v3_entry_content(jsonb)
  from public, anon, authenticated;

-- Normalize only the new credits contract while leaving every historical
-- Confirmation payload field untouched. Missing credit keys remain missing so
-- already-dispatched pre-credits idempotency requests preserve their hash.
create or replace function private.v3_normalize_confirmation_credits_payload(p_payload jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog, private
as $payload$
declare
  v_payload jsonb := p_payload;
  v_entries jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Confirmation payload must be a JSON object' using errcode = '22023';
  end if;

  if p_payload ? 'credits' then
    v_payload := jsonb_set(
      v_payload,
      '{credits}',
      private.v3_normalize_entry_credits(p_payload -> 'credits'),
      true
    );
  end if;

  if p_payload ? 'nf_entries' then
    if jsonb_typeof(p_payload -> 'nf_entries') <> 'array' then
      raise exception 'National Final entries must be a JSON array' using errcode = '22023';
    end if;

    for v_item in select value from jsonb_array_elements(p_payload -> 'nf_entries')
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'National Final entry must be an object' using errcode = '22023';
      end if;
      if v_item ? 'credits' then
        v_item := jsonb_set(
          v_item,
          '{credits}',
          private.v3_normalize_entry_credits(v_item -> 'credits'),
          true
        );
      end if;
      v_entries := v_entries || jsonb_build_array(v_item);
    end loop;

    v_payload := jsonb_set(v_payload, '{nf_entries}', v_entries, true);
  end if;

  return v_payload;
end
$payload$;

revoke all on function private.v3_normalize_confirmation_credits_payload(jsonb)
  from public, anon, authenticated;
grant execute on function private.v3_normalize_confirmation_credits_payload(jsonb)
  to service_role;

-- The canonical V3 Confirmation wrapper sets this transaction-local context.
-- A restore wrapper sets the same context from the selected immutable historical
-- submission snapshot. No browser can set authoritative Entry credits directly.
create or replace function private.v3_apply_entry_credits_context()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $credits$
declare
  v_context_text text;
  v_context jsonb;
  v_candidate jsonb;
  v_top_artist text;
  v_top_song text;
begin
  v_context_text := current_setting('solaris.v3_entry_credits_context', true);
  if nullif(v_context_text, '') is null then
    return new;
  end if;

  begin
    v_context := v_context_text::jsonb;
  exception when others then
    raise exception 'Canonical Entry credits context is invalid' using errcode = '22023';
  end;

  if tg_table_name = 'internal_entries' then
    if v_context ? 'credits' then
      new.credits := private.v3_normalize_entry_credits(v_context -> 'credits');
    end if;
    return new;
  end if;

  if tg_table_name <> 'national_final_entries' then
    return new;
  end if;

  -- Top-level Confirmation artist/song represent the selected NF winner. Its
  -- Credits section therefore overrides a duplicated candidate-level value.
  v_top_artist := private.v3_normalize_confirmation_entry_text(v_context ->> 'artist');
  v_top_song := private.v3_normalize_confirmation_entry_text(v_context ->> 'song_title');
  if v_context ? 'credits'
     and v_top_artist <> ''
     and v_top_song <> ''
     and private.v3_normalize_confirmation_entry_text(new.artist) = v_top_artist
     and private.v3_normalize_confirmation_entry_text(new.song_title) = v_top_song then
    new.credits := private.v3_normalize_entry_credits(v_context -> 'credits');
    return new;
  end if;

  select candidate
  into v_candidate
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_context -> 'nf_entries') = 'array'
        then v_context -> 'nf_entries'
      else '[]'::jsonb
    end
  ) candidate
  where private.v3_normalize_confirmation_entry_text(candidate ->> 'artist')
          = private.v3_normalize_confirmation_entry_text(new.artist)
    and private.v3_normalize_confirmation_entry_text(candidate ->> 'song_title')
          = private.v3_normalize_confirmation_entry_text(new.song_title)
  limit 1;

  if v_candidate ? 'credits' then
    new.credits := private.v3_normalize_entry_credits(v_candidate -> 'credits');
  end if;

  return new;
end
$credits$;

revoke all on function private.v3_apply_entry_credits_context()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_00_apply_internal_entry_credits_context on public.internal_entries;
create trigger v3_00_apply_internal_entry_credits_context
before insert or update on public.internal_entries
for each row execute function private.v3_apply_entry_credits_context();

drop trigger if exists v3_00_apply_nf_entry_credits_context on public.national_final_entries;
create trigger v3_00_apply_nf_entry_credits_context
before insert or update on public.national_final_entries
for each row execute function private.v3_apply_entry_credits_context();

-- Extend the canonical V3 authority without reopening the legacy writer. S2/S5
-- consequences remain attached to the same v3_confirmation_operations insert.
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

  -- jsonb::text is deterministic for the logical object. Network metadata is
  -- excluded so the same dispatched operation can reconcile after an IP change.
  v_request_hash := encode(
    extensions.digest(
      convert_to((v_payload - 'client_ip')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- `_request_hash` remains for the shipped adapter but is never authority.
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

-- One participant/Organizer-safe current-value projection. Authorization is the
-- same exact Entry->submission->edition scope already used by immutable history.
create or replace function public.v3_confirmation_entry_credits(
  p_target_type text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_context jsonb;
  v_allowed boolean;
  v_credits jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_context := private.studio2_confirmation_review_context(p_target_type, p_entry_id);
  v_allowed := public.studio2_access_allowed(
    'confirmation.manage',
    (v_context ->> 'editionId')::uuid,
    false
  );

  if not v_allowed then
    select exists (
      select 1
      from jsonb_array_elements(
        public.public_country_account_confirmation_access() -> 'responses'
      ) response
      where response ->> 'submission_id' = v_context ->> 'submissionId'
    ) into v_allowed;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'Entry credits access denied' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(p_target_type, ''))) = 'internal' then
    select entry.credits
    into v_credits
    from public.internal_entries entry
    where entry.id = p_entry_id;
  else
    select entry.credits
    into v_credits
    from public.national_final_entries entry
    where entry.id = p_entry_id;
  end if;

  return jsonb_build_object(
    'entry_id', p_entry_id,
    'submission_id', v_context ->> 'submissionId',
    'current_version_id', v_context ->> 'currentVersionId',
    'content_revision', (v_context ->> 'contentRevision')::bigint,
    'credits', coalesce(v_credits, '[]'::jsonb)
  );
end
$projection$;

revoke all on function public.v3_confirmation_entry_credits(text, uuid)
  from public, anon;
grant execute on function public.v3_confirmation_entry_credits(text, uuid)
  to authenticated, service_role;

-- Restore Credits from the exact historical submission snapshot before the
-- existing apply helper mutates Entry rows. Old snapshots intentionally restore
-- an empty set. The existing provenance GUC and exact-version review semantics
-- remain unchanged.
create or replace function public.admin_restore_confirmation_version(
  _submission_id uuid,
  _version_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $restore$
declare
  target_round_id uuid;
  native_admin boolean := false;
  solaris_admin boolean := false;
  previous_restore_version text;
  previous_credits_context text;
  restore_result jsonb;
  v_snapshot jsonb;
  v_internal jsonb;
  v_nf_entries jsonb;
  v_credit_entries jsonb := '[]'::jsonb;
  v_item jsonb;
  v_credit_context jsonb;
begin
  native_admin := private.solaris_confirmation_admin_allowed();
  if not native_admin then
    solaris_admin := private.solaris_confirmation_admin_allowed();
  end if;
  if not (native_admin or solaris_admin) then
    raise exception 'Forbidden';
  end if;

  if nullif(btrim(coalesce(_reason, '')), '') is null then
    raise exception 'Restore reason is required';
  end if;

  select s.round_id
  into target_round_id
  from public.submissions s
  where s.id = _submission_id;
  if target_round_id is null then
    raise exception 'Submission not found';
  end if;

  -- Match submit_confirmation(): round first, then submission inside the helper.
  perform 1
  from public.submission_rounds r
  where r.id = target_round_id
  for update;

  select version.snapshot
  into v_snapshot
  from public.submission_versions version
  where version.id = _version_id
    and version.submission_id = _submission_id;
  if v_snapshot is null then
    raise exception 'Historical version not found for this submission';
  end if;

  if exists (
    select 1
    from public.submission_versions v
    join public.national_finals nf
      on nf.submission_id = _submission_id
    join public.national_final_entries removed_entry
      on removed_entry.national_final_id = nf.id
     and coalesce(removed_entry.removed, false) = true
    where v.id = _version_id
      and v.submission_id = _submission_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(v.snapshot -> 'nf_entries') = 'array'
              then v.snapshot -> 'nf_entries'
            else '[]'::jsonb
          end
        ) historical_entry
        where coalesce((historical_entry ->> 'removed')::boolean, false) = false
          and private.v3_normalize_confirmation_entry_text(historical_entry ->> 'artist')
              = private.v3_normalize_confirmation_entry_text(removed_entry.artist)
          and private.v3_normalize_confirmation_entry_text(historical_entry ->> 'song_title')
              = private.v3_normalize_confirmation_entry_text(removed_entry.song_title)
      )
  ) then
    raise exception 'Restore blocked: the historical snapshot contains a National Final entry removed by organizer moderation';
  end if;

  v_internal := case
    when jsonb_typeof(v_snapshot -> 'internal') = 'object'
      then v_snapshot -> 'internal'
    else '{}'::jsonb
  end;
  v_nf_entries := case
    when jsonb_typeof(v_snapshot -> 'nf_entries') = 'array'
      then v_snapshot -> 'nf_entries'
    else '[]'::jsonb
  end;

  for v_item in select value from jsonb_array_elements(v_nf_entries)
  loop
    v_credit_entries := v_credit_entries || jsonb_build_array(
      jsonb_build_object(
        'artist', v_item ->> 'artist',
        'song_title', v_item ->> 'song_title',
        'credits', private.v3_normalize_entry_credits(
          case
            when v_item ? 'credits' then v_item -> 'credits'
            else '[]'::jsonb
          end
        )
      )
    );
  end loop;

  v_credit_context := jsonb_build_object(
    'credits', private.v3_normalize_entry_credits(
      case
        when v_internal ? 'credits' then v_internal -> 'credits'
        else '[]'::jsonb
      end
    ),
    'nf_entries', v_credit_entries
  );

  previous_restore_version := current_setting(
    'solaris.v3_restore_submission_version_id',
    true
  );
  previous_credits_context := current_setting(
    'solaris.v3_entry_credits_context',
    true
  );

  perform set_config(
    'solaris.v3_restore_submission_version_id',
    _version_id::text,
    true
  );
  perform set_config(
    'solaris.v3_entry_credits_context',
    v_credit_context::text,
    true
  );

  begin
    restore_result := public.admin_restore_confirmation_version_apply(
      _submission_id,
      _version_id,
      _reason
    );
  exception when others then
    perform set_config(
      'solaris.v3_restore_submission_version_id',
      coalesce(previous_restore_version, ''),
      true
    );
    perform set_config(
      'solaris.v3_entry_credits_context',
      coalesce(previous_credits_context, ''),
      true
    );
    raise;
  end;

  perform set_config(
    'solaris.v3_restore_submission_version_id',
    coalesce(previous_restore_version, ''),
    true
  );
  perform set_config(
    'solaris.v3_entry_credits_context',
    coalesce(previous_credits_context, ''),
    true
  );

  return restore_result;
end
$restore$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text)
  from public;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to authenticated, service_role;

-- Structural postconditions. This deliberately does not rewrite version rows;
-- clean replay / upgrade rehearsal verifies existing pointers and hashes remain.
do $verify$
begin
  if exists (
    select 1 from public.internal_entries entry
    where entry.credits is null
       or entry.credits is distinct from private.v3_normalize_entry_credits(entry.credits)
  ) then
    raise exception 'Internal Entry credits are not canonical';
  end if;

  if exists (
    select 1 from public.national_final_entries entry
    where entry.credits is null
       or entry.credits is distinct from private.v3_normalize_entry_credits(entry.credits)
  ) then
    raise exception 'National Final Entry credits are not canonical';
  end if;

  if has_function_privilege('anon', 'public.v3_confirmation_entry_credits(text,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.v3_confirmation_entry_credits(text,uuid)', 'EXECUTE') then
    raise exception 'Entry credits projection grants are unsafe';
  end if;

  if has_function_privilege('anon', 'public.submit_confirmation(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.submit_confirmation(jsonb)', 'EXECUTE') then
    raise exception 'Legacy Confirmation submit bypass was reopened';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;

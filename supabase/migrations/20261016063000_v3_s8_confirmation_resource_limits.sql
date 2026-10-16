begin;

-- System V3 S8: bound anonymous Confirmation draft storage.
--
-- Read-only production audit before enforcement (2026-10-16):
--   rows: 43
--   max payload: 1,728 bytes
--   p95: 1,519.4 bytes
--   p99: 1,681.38 bytes
--   average: 901.14 bytes
--
-- 32 KiB therefore preserves >18x headroom above the largest observed draft
-- while preventing arbitrary multi-megabyte anonymous JSON writes. Keep the
-- same limit at the RPC and table boundaries so legacy, V3 and internal writers
-- share one resource invariant.

create or replace function private.v3_assert_confirmation_draft_resource_budget(
  p_payload jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $budget$
begin
  if p_payload is null then
    raise exception 'Confirmation draft payload is required' using errcode = '22023';
  end if;

  if octet_length(p_payload::text) > 32768 then
    raise exception 'Confirmation draft payload exceeds the 32 KiB resource limit'
      using errcode = '54000';
  end if;
end
$budget$;

revoke all on function private.v3_assert_confirmation_draft_resource_budget(jsonb)
  from public, anon, authenticated;
grant execute on function private.v3_assert_confirmation_draft_resource_budget(jsonb)
  to service_role;

alter table public.submission_drafts
  drop constraint if exists submission_drafts_payload_resource_budget;
alter table public.submission_drafts
  add constraint submission_drafts_payload_resource_budget
  check (octet_length(payload::text) <= 32768) not valid;
alter table public.submission_drafts
  validate constraint submission_drafts_payload_resource_budget;

-- Preserve the historical compatibility RPC while applying the same durable
-- storage budget before any insert/update work occurs.
create or replace function public.public_save_draft(
  _round_id uuid,
  _browser_session_id text,
  _payload jsonb,
  _instagram_username text,
  _country text,
  _ip text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $legacy$
declare
  saved_time timestamptz := now();
begin
  if _browser_session_id is null
     or length(trim(_browser_session_id)) < 1
     or length(_browser_session_id) > 80 then
    return jsonb_build_object('ok', false);
  end if;

  perform private.v3_assert_confirmation_draft_resource_budget(_payload);

  insert into public.submission_drafts(
    round_id,
    browser_session_id,
    payload,
    instagram_username,
    country,
    initial_ip,
    latest_ip,
    updated_at
  ) values (
    _round_id,
    _browser_session_id,
    _payload,
    nullif(trim(_instagram_username), ''),
    nullif(trim(_country), ''),
    _ip,
    _ip,
    saved_time
  )
  on conflict(round_id, browser_session_id) do update set
    payload = excluded.payload,
    instagram_username = excluded.instagram_username,
    country = excluded.country,
    latest_ip = excluded.latest_ip,
    initial_ip = coalesce(public.submission_drafts.initial_ip, excluded.initial_ip),
    updated_at = saved_time;

  return jsonb_build_object('ok', true, 'saved_at', saved_time);
end
$legacy$;

revoke all on function public.public_save_draft(uuid, text, jsonb, text, text, text)
  from public;
grant execute on function public.public_save_draft(uuid, text, jsonb, text, text, text)
  to anon, authenticated, service_role;

create or replace function public.v3_save_confirmation_draft(
  _round_id uuid,
  _browser_session_id text,
  _payload jsonb,
  _expected_revision bigint,
  _instagram_username text,
  _country text,
  _ip text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_existing public.submission_drafts%rowtype;
  v_saved public.submission_drafts%rowtype;
  v_expected bigint := coalesce(_expected_revision, 0);
begin
  if _round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'Confirmation draft payload must be a JSON object' using errcode = '22023';
  end if;
  perform private.v3_assert_confirmation_draft_resource_budget(_payload);
  if v_expected < 0 then
    raise exception 'Confirmation draft revision cannot be negative' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'v3-confirmation-draft:' || _round_id::text || ':' || _browser_session_id,
      0
    )
  );

  select draft.*
  into v_existing
  from public.submission_drafts draft
  where draft.round_id = _round_id
    and draft.browser_session_id = _browser_session_id
  for update;

  if found then
    if v_existing.v3_revision <> v_expected then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', v_existing.v3_revision,
        'payload', v_existing.payload,
        'updated_at', v_existing.updated_at
      );
    end if;

    update public.submission_drafts draft
    set
      payload = _payload,
      instagram_username = nullif(btrim(_instagram_username), ''),
      country = nullif(btrim(_country), ''),
      latest_ip = nullif(btrim(_ip), ''),
      updated_at = now()
    where draft.id = v_existing.id
    returning draft.* into v_saved;
  else
    if v_expected <> 0 then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', 0,
        'payload', null,
        'updated_at', null
      );
    end if;

    insert into public.submission_drafts (
      round_id,
      browser_session_id,
      payload,
      instagram_username,
      country,
      initial_ip,
      latest_ip,
      v3_revision,
      created_at,
      updated_at
    ) values (
      _round_id,
      _browser_session_id,
      _payload,
      nullif(btrim(_instagram_username), ''),
      nullif(btrim(_country), ''),
      nullif(btrim(_ip), ''),
      nullif(btrim(_ip), ''),
      1,
      now(),
      now()
    )
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'revision', v_saved.v3_revision,
    'saved_at', v_saved.updated_at
  );
end
$save$;

revoke all on function public.v3_save_confirmation_draft(uuid, text, jsonb, bigint, text, text, text)
  from public;
grant execute on function public.v3_save_confirmation_draft(uuid, text, jsonb, bigint, text, text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

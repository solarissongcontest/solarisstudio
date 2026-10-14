begin;

-- Jury V3 extends the existing canonical country-jury writer. It does not
-- create a second ballot store: drafts and operation receipts live in private,
-- while the accepted ballot continues to be written by
-- public.submit_country_jury_ballot(uuid,jsonb,uuid).
create table if not exists private.v3_jury_drafts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null,
  voter_country_id uuid not null references public.countries(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  device_id text,
  session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, user_id),
  constraint v3_jury_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint v3_jury_drafts_payload_bounded check (octet_length(payload::text) <= 32768),
  constraint v3_jury_drafts_device_id_bounded check (device_id is null or length(device_id) <= 120),
  constraint v3_jury_drafts_session_id_bounded check (session_id is null or length(session_id) <= 120)
);

create index if not exists v3_jury_drafts_user_updated_idx
  on private.v3_jury_drafts(user_id, updated_at desc);

create table if not exists private.v3_jury_operations (
  operation_id uuid primary key,
  request_hash text not null,
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null,
  voter_country_id uuid not null references public.countries(id) on delete restrict,
  ballot_submission_id uuid not null unique references public.jury_ballot_submissions(id) on delete restrict,
  receipt_id uuid not null unique default gen_random_uuid(),
  state_version bigint not null default 1 check (state_version > 0),
  result jsonb not null,
  accepted_at timestamptz not null default now(),
  constraint v3_jury_operations_request_hash_not_blank check (length(btrim(request_hash)) > 0)
);

create index if not exists v3_jury_operations_owner_show_idx
  on private.v3_jury_operations(user_id, show_id, accepted_at desc);

revoke all on table private.v3_jury_drafts from public, anon, authenticated;
revoke all on table private.v3_jury_operations from public, anon, authenticated;
grant all on table private.v3_jury_drafts to service_role;
grant all on table private.v3_jury_operations to service_role;

create or replace function public.v3_load_jury_draft(_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $load$
declare
  v_user_id uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_draft private.v3_jury_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null then
    raise exception 'Jury show is required' using errcode = '22023';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = v_user_id
    and coalesce(account.status, 'active') = 'active'
  limit 1;

  if not found then
    raise exception 'An active country account is required' using errcode = '42501';
  end if;

  select draft.* into v_draft
  from private.v3_jury_drafts draft
  where draft.show_id = _show_id
    and draft.user_id = v_user_id
    and draft.voter_country_id = v_account.country_id;

  if not found then
    return jsonb_build_object(
      'found', false,
      'show_id', _show_id,
      'revision', 0,
      'server_time', now()
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'draft_id', v_draft.id,
    'show_id', v_draft.show_id,
    'payload', v_draft.payload,
    'revision', v_draft.revision,
    'server_revision', v_draft.revision,
    'device_id', v_draft.device_id,
    'session_id', v_draft.session_id,
    'updated_at', v_draft.updated_at,
    'server_time', now()
  );
end
$load$;

create or replace function public.v3_save_jury_draft(
  _show_id uuid,
  _payload jsonb,
  _expected_revision bigint,
  _device_id text default null,
  _session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_user_id uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_window public.jury_voting_windows%rowtype;
  v_existing private.v3_jury_drafts%rowtype;
  v_saved private.v3_jury_drafts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null or _payload is null or jsonb_typeof(_payload) <> 'object'
     or octet_length(_payload::text) > 32768 then
    raise exception 'Jury draft payload is invalid' using errcode = '22023';
  end if;
  if _expected_revision is null or _expected_revision < 0 then
    raise exception 'Expected jury draft revision is invalid' using errcode = '22023';
  end if;
  if length(coalesce(_device_id, '')) > 120 or length(coalesce(_session_id, '')) > 120 then
    raise exception 'Jury draft device context is invalid' using errcode = '22023';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = v_user_id
    and coalesce(account.status, 'active') = 'active'
  limit 1;
  if not found then
    raise exception 'An active country account is required' using errcode = '42501';
  end if;

  select voting_window.* into v_window
  from public.jury_voting_windows voting_window
  where voting_window.show_id = _show_id;
  if not found or v_window.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'round_closed', 'server_time', now());
  end if;

  if not exists (
    select 1 from public.voters voter
    where voter.show_id = _show_id and voter.country_id = v_account.country_id
  ) and (
    exists (select 1 from public.voters voter where voter.show_id = _show_id)
    or not exists (
      select 1 from public.participants participant
      where participant.show_id = _show_id
        and participant.country_id = v_account.country_id
        and (participant.participation_status is null or participant.participation_status = 'confirmed')
    )
  ) then
    raise exception 'Your country is not eligible to jury vote in this show' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.jury_ballot_submissions ballot
    where ballot.show_id = _show_id and ballot.voter_country_id = v_account.country_id
  ) or exists (
    select 1 from public.jury_votes vote
    where vote.show_id = _show_id and vote.voter_country_id = v_account.country_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_submitted', 'server_time', now());
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-jury-draft:' || v_user_id::text || ':' || _show_id::text, 0)
  );

  select draft.* into v_existing
  from private.v3_jury_drafts draft
  where draft.show_id = _show_id and draft.user_id = v_user_id;

  if found and v_existing.revision <> _expected_revision then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'stale_revision',
      'draft_id', v_existing.id,
      'payload', v_existing.payload,
      'revision', v_existing.revision,
      'server_revision', v_existing.revision,
      'device_id', v_existing.device_id,
      'session_id', v_existing.session_id,
      'updated_at', v_existing.updated_at,
      'server_time', now()
    );
  end if;

  if not found and _expected_revision <> 0 then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'stale_revision',
      'revision', 0,
      'server_revision', 0,
      'server_time', now()
    );
  end if;

  if v_existing.id is null then
    insert into private.v3_jury_drafts (
      show_id, user_id, voter_country_id, payload, revision, device_id, session_id
    ) values (
      _show_id, v_user_id, v_account.country_id, _payload, 1,
      nullif(btrim(_device_id), ''), nullif(btrim(_session_id), '')
    ) returning * into v_saved;
  else
    update private.v3_jury_drafts
    set payload = _payload,
        revision = revision + 1,
        device_id = nullif(btrim(_device_id), ''),
        session_id = nullif(btrim(_session_id), ''),
        updated_at = now()
    where id = v_existing.id
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'draft_id', v_saved.id,
    'show_id', v_saved.show_id,
    'payload', v_saved.payload,
    'revision', v_saved.revision,
    'server_revision', v_saved.revision,
    'device_id', v_saved.device_id,
    'session_id', v_saved.session_id,
    'updated_at', v_saved.updated_at,
    'server_time', now()
  );
end
$save$;

create or replace function public.v3_submit_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid,
  _operation_id uuid,
  _request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $submit$
declare
  v_user_id uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_existing private.v3_jury_operations%rowtype;
  v_ballot_id uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_accepted_at timestamptz := now();
  v_request_hash text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null or _preflight_id is null or _operation_id is null
     or _entries is null or jsonb_typeof(_entries) <> 'array' then
    raise exception 'Jury submission context is invalid' using errcode = '22023';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = v_user_id
    and coalesce(account.status, 'active') = 'active'
  limit 1;
  if not found then
    raise exception 'An active country account is required' using errcode = '42501';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'show_id', _show_id,
        'preflight_id', _preflight_id,
        'entries', _entries
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  -- Kept only for adapter compatibility. Direct callers cannot choose the
  -- authoritative request identity.
  perform _request_hash;

  perform pg_advisory_xact_lock(hashtextextended('v3-jury:' || _operation_id::text, 0));

  select operation.* into v_existing
  from private.v3_jury_operations operation
  where operation.operation_id = _operation_id;

  if found then
    if v_existing.user_id <> v_user_id
       or v_existing.show_id <> _show_id
       or v_existing.voter_country_id <> v_account.country_id
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Jury operation id was already used for a different request'
        using errcode = '22023';
    end if;

    return v_existing.result || jsonb_build_object(
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'operation_id', v_existing.operation_id,
        'receipt_id', v_existing.receipt_id,
        'ballot_submission_id', v_existing.ballot_submission_id,
        'show_id', v_existing.show_id,
        'voter_country_id', v_existing.voter_country_id,
        'request_hash', v_existing.request_hash,
        'state_version', v_existing.state_version,
        'accepted_at', v_existing.accepted_at,
        'server_time', now(),
        'replayed', true
      )
    );
  end if;

  v_ballot_id := public.submit_country_jury_ballot(_show_id, _entries, _preflight_id);
  if v_ballot_id is null then
    raise exception 'Jury submission returned no ballot id' using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'ballot_submission_id', v_ballot_id,
    'show_id', _show_id
  );

  insert into private.v3_jury_operations (
    operation_id, request_hash, show_id, user_id, voter_country_id,
    ballot_submission_id, receipt_id, state_version, result, accepted_at
  ) values (
    _operation_id, v_request_hash, _show_id, v_user_id, v_account.country_id,
    v_ballot_id, v_receipt_id, 1, v_result, v_accepted_at
  );

  delete from private.v3_jury_drafts draft
  where draft.show_id = _show_id and draft.user_id = v_user_id;

  return v_result || jsonb_build_object(
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'operation_id', _operation_id,
      'receipt_id', v_receipt_id,
      'ballot_submission_id', v_ballot_id,
      'show_id', _show_id,
      'voter_country_id', v_account.country_id,
      'request_hash', v_request_hash,
      'state_version', 1,
      'accepted_at', v_accepted_at,
      'server_time', now(),
      'replayed', false
    )
  );
end
$submit$;

create or replace function public.v3_reconcile_jury_submission(_operation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $reconcile$
  select case
    when auth.uid() is null then jsonb_build_object('found', false, 'server_time', now())
    else coalesce((
      select operation.result || jsonb_build_object(
        'found', true,
        'receipt', jsonb_build_object(
          'authority', 'authoritative_server',
          'operation_id', operation.operation_id,
          'receipt_id', operation.receipt_id,
          'ballot_submission_id', operation.ballot_submission_id,
          'show_id', operation.show_id,
          'voter_country_id', operation.voter_country_id,
          'request_hash', operation.request_hash,
          'state_version', operation.state_version,
          'accepted_at', operation.accepted_at,
          'server_time', now(),
          'replayed', true
        )
      )
      from private.v3_jury_operations operation
      where operation.operation_id = _operation_id
        and operation.user_id = auth.uid()
    ), jsonb_build_object('found', false, 'server_time', now()))
  end
$reconcile$;

create or replace function public.v3_jury_receipt(_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $receipt$
declare
  v_user_id uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_ballot public.jury_ballot_submissions%rowtype;
  v_operation private.v3_jury_operations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = v_user_id
  limit 1;
  if not found then
    if exists (
      select 1
      from public.jury_votes vote
      where vote.show_id = _show_id
        and vote.voter_country_id = v_account.country_id
    ) then
      return jsonb_build_object(
        'submitted', true,
        'found', false,
        'legacy', true,
        'show_id', _show_id,
        'voter_country_id', v_account.country_id,
        'server_time', now()
      );
    end if;

    return jsonb_build_object('submitted', false, 'found', false, 'server_time', now());
  end if;

  select ballot.* into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.show_id = _show_id
    and ballot.user_id = v_user_id
    and ballot.voter_country_id = v_account.country_id
  order by ballot.submitted_at desc
  limit 1;
  if not found then
    return jsonb_build_object('submitted', false, 'found', false, 'server_time', now());
  end if;

  select operation.* into v_operation
  from private.v3_jury_operations operation
  where operation.ballot_submission_id = v_ballot.id
    and operation.user_id = v_user_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'submitted', true,
      'found', false,
      'ballot_submission_id', v_ballot.id,
      'submitted_at', v_ballot.submitted_at,
      'server_time', now()
    );
  end if;

  return jsonb_build_object(
    'submitted', true,
    'found', true,
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'operation_id', v_operation.operation_id,
      'receipt_id', v_operation.receipt_id,
      'ballot_submission_id', v_operation.ballot_submission_id,
      'show_id', v_operation.show_id,
      'voter_country_id', v_operation.voter_country_id,
      'request_hash', v_operation.request_hash,
      'state_version', v_operation.state_version,
      'accepted_at', v_operation.accepted_at,
      'server_time', now(),
      'replayed', true
    )
  );
end
$receipt$;

revoke all on function public.v3_load_jury_draft(uuid) from public, anon;
revoke all on function public.v3_save_jury_draft(uuid,jsonb,bigint,text,text) from public, anon;
revoke all on function public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text) from public, anon;
revoke all on function public.v3_reconcile_jury_submission(uuid) from public, anon;
revoke all on function public.v3_jury_receipt(uuid) from public, anon;

grant execute on function public.v3_load_jury_draft(uuid) to authenticated, service_role;
grant execute on function public.v3_save_jury_draft(uuid,jsonb,bigint,text,text) to authenticated, service_role;
grant execute on function public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text) to authenticated, service_role;
grant execute on function public.v3_reconcile_jury_submission(uuid) to authenticated, service_role;
grant execute on function public.v3_jury_receipt(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

begin;

select public.v3_register_migration_contract(
  'v3.televote.moderation-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'S16 introduces governed atomic Televote ballot moderation and revision tracking'
);

-- S16: moderation of a submitted public ballot is consequential Televote state,
-- not generic admin CRUD. Give every ballot a revision and funnel all Organizer
-- status/note/delete/restore/entry replacement mutations through one atomic,
-- edition-scoped command.
create table if not exists public.studio2_televote_submission_versions (
  submission_id uuid primary key references televoting.vote_submissions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_televote_submission_versions (submission_id, version)
select submission.id, 0
from televoting.vote_submissions submission
on conflict (submission_id) do nothing;

alter table public.studio2_televote_submission_versions enable row level security;
revoke all on table public.studio2_televote_submission_versions
  from public, anon, authenticated, service_role;

create or replace function private.v3_touch_televote_submission_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $touch$
declare
  v_submission_id uuid;
begin
  if tg_table_schema = 'televoting' and tg_table_name = 'vote_submissions' then
    v_submission_id := coalesce(new.id, old.id);
  else
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  end if;

  if tg_op = 'INSERT' and tg_table_name = 'vote_submissions' then
    insert into public.studio2_televote_submission_versions (submission_id, version, updated_at)
    values (v_submission_id, 0, now())
    on conflict (submission_id) do nothing;
  else
    insert into public.studio2_televote_submission_versions (submission_id, version, updated_at)
    values (v_submission_id, 1, now())
    on conflict (submission_id) do update
    set version = public.studio2_televote_submission_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;
  return coalesce(new, old);
end
$touch$;

revoke all on function private.v3_touch_televote_submission_version()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_touch_televote_submission_version on televoting.vote_submissions;
create trigger v3_touch_televote_submission_version
after insert or update on televoting.vote_submissions
for each row execute function private.v3_touch_televote_submission_version();

drop trigger if exists v3_touch_televote_entry_version on televoting.vote_entries;
create trigger v3_touch_televote_entry_version
after insert or update or delete on televoting.vote_entries
for each row execute function private.v3_touch_televote_submission_version();

create or replace function televoting.admin_submission_versions(
  p_submission_ids uuid[]
)
returns table(submission_id uuid, version bigint)
language sql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $versions$
  select version_row.submission_id, version_row.version
  from public.studio2_televote_submission_versions version_row
  join televoting.vote_submissions submission
    on submission.id = version_row.submission_id
  join public.televoting_round_bindings binding
    on binding.remote_round_id = submission.round_id::text
  where version_row.submission_id = any(coalesce(p_submission_ids, array[]::uuid[]))
    and public.studio2_access_allowed('voting.read', binding.edition_id, false)
$versions$;

revoke all on function televoting.admin_submission_versions(uuid[])
  from public, anon, service_role;
grant execute on function televoting.admin_submission_versions(uuid[])
  to authenticated;

create or replace function televoting.v3_moderate_submission(
  p_submission_id uuid,
  p_action text,
  p_payload jsonb,
  p_reason text,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $moderate$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_submission televoting.vote_submissions%rowtype;
  v_solaris_edition_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_status text;
  v_note text;
  v_entry jsonb;
  v_entry_key text;
  v_points integer;
  v_total integer := 0;
  v_count integer := 0;
  v_seen text[] := array[]::text[];
  v_self_key text;
  v_before_entries jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_submission_id is null
     or p_expected_version is null or p_expected_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object'
     or v_action not in ('set_status', 'soft_delete', 'restore', 'update_note', 'replace_entries') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select submission.*
  into v_submission
  from televoting.vote_submissions submission
  where submission.id = p_submission_id;
  if v_submission.id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;

  select binding.edition_id
  into v_solaris_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = v_submission.round_id::text;
  if v_solaris_edition_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.submission.' || v_action,
    case when v_action in ('soft_delete', 'restore', 'replace_entries') then 'R2' else 'R1' end,
    jsonb_build_object(
      'editionId', v_solaris_edition_id,
      'roundId', v_submission.round_id,
      'submissionId', p_submission_id
    ),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return coalesce(v_claim -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'operationId', v_canonical_operation_id);
  end if;

  select submission.*
  into v_submission
  from televoting.vote_submissions submission
  where submission.id = p_submission_id
  for update;

  select coalesce(version_row.version, 0)
  into v_current_version
  from public.studio2_televote_submission_versions version_row
  where version_row.submission_id = p_submission_id
  for update;
  if not found then
    insert into public.studio2_televote_submission_versions (submission_id, version)
    values (p_submission_id, 0)
    on conflict (submission_id) do nothing;
    v_current_version := 0;
  end if;

  if v_current_version is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_action = 'set_status' then
    v_status := lower(btrim(coalesce(v_payload ->> 'status', '')));
    if v_status not in ('active', 'suspicious', 'verified') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if v_submission.status = 'deleted' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    update televoting.vote_submissions
    set status = v_status,
        verified_at = case when v_status = 'verified' then now() else null end,
        verified_by = case when v_status = 'verified' then auth.uid() else null end
    where id = p_submission_id;

  elsif v_action = 'soft_delete' then
    if v_reason is null or length(v_reason) < 3 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if v_submission.status = 'deleted' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    update televoting.vote_submissions
    set status = 'deleted',
        deleted_at = now(),
        deleted_by = auth.uid(),
        deletion_category = 'organizer_moderation',
        deletion_reason = v_reason,
        moderator_note = v_reason
    where id = p_submission_id;

  elsif v_action = 'restore' then
    if v_submission.status <> 'deleted' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    update televoting.vote_submissions
    set status = 'active',
        deleted_at = null,
        deleted_by = null,
        deletion_category = null,
        deletion_reason = null
    where id = p_submission_id;

  elsif v_action = 'update_note' then
    v_note := btrim(coalesce(v_payload ->> 'note', ''));
    if length(v_note) > 4000 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update televoting.vote_submissions
    set moderator_note = nullif(v_note, '')
    where id = p_submission_id;

  else
    if v_reason is null or length(v_reason) < 3
       or jsonb_typeof(v_payload -> 'entries') <> 'array'
       or jsonb_array_length(v_payload -> 'entries') not between 5 and 20 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if v_submission.status = 'deleted' then
      raise exception using errcode = '25000', message = 'STATE_CHANGED';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'target_country_code', entry.target_country_code,
          'points', entry.points
        ) order by entry.points desc, entry.target_country_code
      ),
      '[]'::jsonb
    )
    into v_before_entries
    from televoting.vote_entries entry
    where entry.submission_id = p_submission_id;

    select round_entry.entry_key
    into v_self_key
    from televoting.round_entries round_entry
    join televoting.rounds round_row on round_row.id = round_entry.round_id
    where round_entry.round_id = v_submission.round_id
      and round_entry.entry_type = 'country'
      and round_entry.country_code = v_submission.country_code
      and coalesce(round_row.self_voting_mode, 'country_match') in ('country_match', 'linked_identity', 'disabled')
    limit 1;

    for v_entry in select value from jsonb_array_elements(v_payload -> 'entries') loop
      v_entry_key := nullif(btrim(coalesce(v_entry ->> 'target_country_code', '')), '');
      if v_entry_key is null
         or jsonb_typeof(v_entry -> 'points') is distinct from 'number'
         or (v_entry ->> 'points') !~ '^(10|[1-9])$' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_points := (v_entry ->> 'points')::integer;
      if v_entry_key = any(v_seen) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      if not exists (
        select 1 from televoting.round_entries eligible
        where eligible.round_id = v_submission.round_id
          and eligible.entry_key = v_entry_key
      ) then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      if v_self_key is not null and v_entry_key = v_self_key then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_seen := v_seen || v_entry_key;
      v_count := v_count + 1;
      v_total := v_total + v_points;
    end loop;
    if v_count < 5 or v_total <> 20 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    delete from televoting.vote_entries
    where submission_id = p_submission_id;

    insert into televoting.vote_entries (submission_id, target_country_code, points)
    select
      p_submission_id,
      entry ->> 'target_country_code',
      (entry ->> 'points')::integer
    from jsonb_array_elements(v_payload -> 'entries') entry;

    update televoting.vote_submissions
    set edited_at = now(), edited_by = auth.uid()
    where id = p_submission_id;
  end if;

  select version_row.version
  into v_next_version
  from public.studio2_televote_submission_versions version_row
  where version_row.submission_id = p_submission_id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    action,
    target_type,
    target_id,
    old_values,
    new_values,
    reason
  ) values (
    auth.uid(),
    'moderate_submission_' || v_action,
    'vote_submission',
    p_submission_id::text,
    case
      when v_action = 'replace_entries' then v_before_entries
      else jsonb_build_object(
        'status', v_submission.status,
        'moderator_note', v_submission.moderator_note,
        'verified_at', v_submission.verified_at,
        'deleted_at', v_submission.deleted_at
      )
    end,
    v_payload,
    v_reason
  );

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', p_submission_id,
    'action', v_action,
    'previousVersion', v_current_version,
    'version', v_next_version,
    'operationId', v_canonical_operation_id
  );
  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$moderate$;

revoke all on function televoting.v3_moderate_submission(
  uuid, text, jsonb, text, bigint, uuid, text, uuid
) from public, anon, service_role;
grant execute on function televoting.v3_moderate_submission(
  uuid, text, jsonb, text, bigint, uuid, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
commit;

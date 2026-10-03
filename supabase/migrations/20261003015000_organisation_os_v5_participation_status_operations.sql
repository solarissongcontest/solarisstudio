begin;

-- Organisation OS V5: participation-status changes are R2 operations.
--
-- Withdrawal/disqualification/restoration changes scoreboard eligibility across
-- every show row for the identity. Version the identity from authoritative
-- participant + entry truth so UI, service-role and sync changes invalidate a
-- stale organizer preview.

create table if not exists public.studio2_participation_status_versions (
  edition_id uuid not null references public.editions(id) on delete cascade,
  subject_key text not null,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (edition_id, subject_key)
);

alter table public.studio2_participation_status_versions enable row level security;
revoke all on table public.studio2_participation_status_versions from public, anon, authenticated;
grant all on table public.studio2_participation_status_versions to service_role;

create or replace function private.studio2_participation_subject_key(
  p_country_id uuid,
  p_contest_entity_id uuid
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $key$
begin
  if p_country_id is not null then
    return 'country:' || p_country_id::text;
  end if;
  if p_contest_entity_id is not null then
    return 'entity:' || p_contest_entity_id::text;
  end if;
  return null;
end
$key$;

revoke all on function private.studio2_participation_subject_key(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.studio2_touch_participation_status_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_new_edition uuid;
  v_old_edition uuid;
  v_new_subject text;
  v_old_subject text;
begin
  if tg_table_name = 'participants' then
    if tg_op <> 'DELETE' then
      v_new_edition := new.edition_id;
      v_new_subject := private.studio2_participation_subject_key(
        new.country_id,
        new.contest_entity_id
      );
    end if;
    if tg_op <> 'INSERT' then
      v_old_edition := old.edition_id;
      v_old_subject := private.studio2_participation_subject_key(
        old.country_id,
        old.contest_entity_id
      );
    end if;
  elsif tg_table_name = 'entries' then
    if tg_op <> 'DELETE' then
      v_new_edition := new.edition_id;
      v_new_subject := private.studio2_participation_subject_key(new.country_id, null);
    end if;
    if tg_op <> 'INSERT' then
      v_old_edition := old.edition_id;
      v_old_subject := private.studio2_participation_subject_key(old.country_id, null);
    end if;
  end if;

  if v_new_edition is not null and v_new_subject is not null then
    insert into public.studio2_participation_status_versions (
      edition_id,
      subject_key,
      version,
      updated_at
    )
    values (v_new_edition, v_new_subject, 1, now())
    on conflict (edition_id, subject_key) do update
    set version = public.studio2_participation_status_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_edition is not null
     and v_old_subject is not null
     and (
       v_new_edition is distinct from v_old_edition
       or v_new_subject is distinct from v_old_subject
     ) then
    insert into public.studio2_participation_status_versions (
      edition_id,
      subject_key,
      version,
      updated_at
    )
    values (v_old_edition, v_old_subject, 1, now())
    on conflict (edition_id, subject_key) do update
    set version = public.studio2_participation_status_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_participation_status_version()
  from public, anon, authenticated;

drop trigger if exists studio2_participants_touch_status_version on public.participants;
create trigger studio2_participants_touch_status_version
after insert or delete or update of
  edition_id,
  country_id,
  contest_entity_id,
  participation_status
on public.participants
for each row execute function private.studio2_touch_participation_status_version();

drop trigger if exists studio2_entries_touch_participation_status_version on public.entries;
create trigger studio2_entries_touch_participation_status_version
after insert or delete or update of
  edition_id,
  country_id,
  status
on public.entries
for each row execute function private.studio2_touch_participation_status_version();

create or replace function public.studio2_participation_status_change_preview(
  p_edition_id uuid,
  p_country_id uuid,
  p_contest_entity_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_subject text;
  v_version bigint := 0;
  v_participant_rows integer := 0;
  v_mismatched_participants integer := 0;
  v_entry_rows integer := 0;
  v_mismatched_entries integer := 0;
  v_result_rows integer := 0;
  v_published_result_rows integer := 0;
  v_current_status text := 'confirmed';
  v_shows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;
  if p_status not in ('confirmed', 'withdrawn', 'disqualified') then
    raise exception 'Invalid participation status' using errcode = '22023';
  end if;
  if (p_country_id is null) = (p_contest_entity_id is null) then
    raise exception 'Choose exactly one country or contest entity' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('entry.approve', p_edition_id, false) then
    raise exception 'Missing Solaris capability: entry.approve' using errcode = '42501';
  end if;

  v_subject := private.studio2_participation_subject_key(
    p_country_id,
    p_contest_entity_id
  );

  select coalesce((
    select version_row.version
    from public.studio2_participation_status_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.subject_key = v_subject
  ), 0)
  into v_version;

  select
    count(*)::integer,
    count(*) filter (
      where coalesce(participant.participation_status, 'confirmed') <> p_status
    )::integer,
    case
      when count(*) filter (
        where coalesce(participant.participation_status, 'confirmed') = 'disqualified'
      ) > 0 then 'disqualified'
      when count(*) filter (
        where coalesce(participant.participation_status, 'confirmed') = 'withdrawn'
      ) > 0 then 'withdrawn'
      else 'confirmed'
    end,
    coalesce(jsonb_agg(
      distinct jsonb_build_object(
        'showId', show_row.id,
        'showName', show_row.name,
        'published', show_row.published
      )
    ) filter (where show_row.id is not null), '[]'::jsonb)
  into
    v_participant_rows,
    v_mismatched_participants,
    v_current_status,
    v_shows
  from public.participants participant
  left join public.shows show_row on show_row.id = participant.show_id
  where participant.edition_id = p_edition_id
    and (
      (p_country_id is not null and participant.country_id = p_country_id)
      or (
        p_country_id is null
        and participant.country_id is null
        and participant.contest_entity_id = p_contest_entity_id
      )
    );

  if v_participant_rows = 0 then
    raise exception 'Participation record not found' using errcode = 'P0002';
  end if;

  if p_country_id is not null then
    select
      count(*)::integer,
      count(*) filter (where entry.status <> p_status)::integer
    into v_entry_rows, v_mismatched_entries
    from public.entries entry
    where entry.edition_id = p_edition_id
      and entry.country_id = p_country_id;
  end if;

  select
    count(*)::integer,
    count(*) filter (where show_row.published = true)::integer
  into v_result_rows, v_published_result_rows
  from public.results result_row
  left join public.shows show_row on show_row.id = result_row.show_id
  where result_row.edition_id = p_edition_id
    and (
      (p_country_id is not null and result_row.country_id = p_country_id)
      or (
        p_country_id is null
        and result_row.country_id is null
        and result_row.contest_entity_id = p_contest_entity_id
      )
    );

  return jsonb_build_object(
    'riskClass', 'R2',
    'editionId', p_edition_id,
    'countryId', p_country_id,
    'contestEntityId', p_contest_entity_id,
    'subjectKey', v_subject,
    'requestedStatus', p_status,
    'currentStatus', v_current_status,
    'expectedVersion', v_version,
    'participantRows', v_participant_rows,
    'entryRows', v_entry_rows,
    'resultRows', v_result_rows,
    'publishedResultRows', v_published_result_rows,
    'shows', v_shows,
    'alreadyApplied',
      v_mismatched_participants = 0
      and v_mismatched_entries = 0
  );
end
$preview$;

revoke all on function public.studio2_participation_status_change_preview(
  uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.studio2_participation_status_change_preview(
  uuid, uuid, uuid, text
) to authenticated, service_role;

create or replace function public.studio2_apply_participation_status(
  p_edition_id uuid,
  p_country_id uuid,
  p_contest_entity_id uuid,
  p_status text,
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
  v_subject text;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_updated integer := 0;
  v_result jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;
  if p_status not in ('confirmed', 'withdrawn', 'disqualified') then
    raise exception 'Invalid participation status' using errcode = '22023';
  end if;
  if (p_country_id is null) = (p_contest_entity_id is null) then
    raise exception 'Choose exactly one country or contest entity' using errcode = '22023';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected participation version are required'
      using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('entry.approve', p_edition_id, false) then
    raise exception 'Missing Solaris capability: entry.approve' using errcode = '42501';
  end if;

  v_subject := private.studio2_participation_subject_key(
    p_country_id,
    p_contest_entity_id
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'participation.status.' || p_status,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'countryId', p_country_id,
      'contestEntityId', p_contest_entity_id,
      'subjectKey', v_subject,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'studio2-participation-status:' || p_edition_id::text || ':' || v_subject,
      0
    )
  );

  select coalesce((
    select version_row.version
    from public.studio2_participation_status_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.subject_key = v_subject
  ), 0)
  into v_current_version;

  if p_expected_version <> v_current_version then
    raise exception 'Participation status changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_updated := public.admin_set_participation_status(
    p_edition_id,
    p_country_id,
    p_contest_entity_id,
    p_status
  );

  select coalesce((
    select version_row.version
    from public.studio2_participation_status_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.subject_key = v_subject
  ), v_current_version)
  into v_next_version;

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'editionId', p_edition_id,
    'countryId', p_country_id,
    'contestEntityId', p_contest_entity_id,
    'status', p_status,
    'updatedRows', v_updated,
    'operationId', v_operation_id,
    'previousVersion', v_current_version,
    'version', v_next_version
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_participation_status(
  uuid, uuid, uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_participation_status(
  uuid, uuid, uuid, text, uuid, text, bigint
) to authenticated, service_role;

-- Browser organizers must use the previewed R2 command. Keep the primitive for
-- trusted service-role compatibility and existing server-side integrations.
revoke execute on function public.admin_set_participation_status(
  uuid, uuid, uuid, text
) from authenticated;

notify pgrst, 'reload schema';

commit;

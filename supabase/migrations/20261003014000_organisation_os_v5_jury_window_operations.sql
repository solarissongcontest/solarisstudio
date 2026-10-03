begin;

-- Organisation OS V5: jury-window control is an R2 operation.
--
-- Opening one show's country-account jury window may close another window in
-- the same edition, so concurrency must be edition-wide rather than per-show.

create table if not exists public.studio2_jury_window_versions (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_jury_window_versions enable row level security;
revoke all on table public.studio2_jury_window_versions from public, anon, authenticated;
grant all on table public.studio2_jury_window_versions to service_role;

create or replace function private.studio2_touch_jury_window_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_edition_id uuid;
begin
  v_edition_id := case when tg_op = 'DELETE' then old.edition_id else new.edition_id end;

  insert into public.studio2_jury_window_versions (edition_id, version, updated_at)
  values (v_edition_id, 1, now())
  on conflict (edition_id) do update
  set version = public.studio2_jury_window_versions.version + 1,
      updated_at = excluded.updated_at;

  if tg_op = 'UPDATE'
     and old.edition_id is distinct from new.edition_id then
    insert into public.studio2_jury_window_versions (edition_id, version, updated_at)
    values (old.edition_id, 1, now())
    on conflict (edition_id) do update
    set version = public.studio2_jury_window_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_jury_window_version()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_window_touch_edition_version
  on public.jury_voting_windows;
create trigger studio2_jury_window_touch_edition_version
after insert or update or delete on public.jury_voting_windows
for each row execute function private.studio2_touch_jury_window_version();

create or replace function public.studio2_jury_window_change_preview(
  p_show_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_show public.shows%rowtype;
  v_version bigint := 0;
  v_current_status text := 'closed';
  v_submitted integer := 0;
  v_other_open jsonb := '[]'::jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_jury_window_versions version_row
    where version_row.edition_id = v_show.edition_id
  ), 0)
  into v_version;

  select coalesce(window_row.status, 'closed')
  into v_current_status
  from public.jury_voting_windows window_row
  where window_row.show_id = p_show_id;

  if not found then
    v_current_status := 'closed';
  end if;

  select count(*)::integer
  into v_submitted
  from public.jury_ballot_submissions submission
  where submission.show_id = p_show_id
    and submission.status = 'submitted';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'showId', other_show.id,
      'showName', other_show.name
    )
    order by other_show.sort_order, other_show.name
  ), '[]'::jsonb)
  into v_other_open
  from public.jury_voting_windows other_window
  join public.shows other_show on other_show.id = other_window.show_id
  where other_window.edition_id = v_show.edition_id
    and other_window.show_id <> p_show_id
    and other_window.status = 'open';

  return jsonb_build_object(
    'riskClass', 'R2',
    'showId', v_show.id,
    'showName', v_show.name,
    'editionId', v_show.edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_current_status,
    'expectedVersion', v_version,
    'submittedBallots', v_submitted,
    'otherOpenWindows', v_other_open,
    'alreadyApplied', v_current_status = p_status
  );
end
$preview$;

revoke all on function public.studio2_jury_window_change_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_jury_window_change_preview(uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_jury_voting_status(
  p_show_id uuid,
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
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_change jsonb;
  v_result jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected jury-window version are required'
      using errcode = '22023';
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.window.' || p_status,
    'R2',
    jsonb_build_object(
      'editionId', v_show.edition_id,
      'showId', p_show_id,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-jury-window:' || v_show.edition_id::text, 0)
  );

  select coalesce((
    select version_row.version
    from public.studio2_jury_window_versions version_row
    where version_row.edition_id = v_show.edition_id
  ), 0)
  into v_current_version;

  if p_expected_version <> v_current_version then
    raise exception 'Jury voting windows changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_change := public.admin_set_jury_voting_status(p_show_id, p_status);

  select coalesce((
    select version_row.version
    from public.studio2_jury_window_versions version_row
    where version_row.edition_id = v_show.edition_id
  ), v_current_version)
  into v_next_version;

  v_result := coalesce(v_change, '{}'::jsonb) || jsonb_build_object(
    'riskClass', 'R2',
    'operationId', v_operation_id,
    'previousVersion', v_current_version,
    'version', v_next_version
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_jury_voting_status(
  uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_voting_status(
  uuid, text, uuid, text, bigint
) to authenticated, service_role;

-- Browser organizers must use preview + R2 apply. Trusted service-role
-- compatibility code may still call the legacy primitive.
revoke execute on function public.admin_set_jury_voting_status(uuid, text)
  from authenticated;

notify pgrst, 'reload schema';

commit;

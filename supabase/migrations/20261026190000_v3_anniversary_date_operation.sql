begin;

-- Worker 6 / System request #633.
--
-- Historical edition dates are canonical contest history. Keep the existing
-- editions.event_date store, but move Organizer writes behind the V3 operation
-- contract so the browser can no longer own authorization, CAS or retry truth.
select public.v3_register_migration_contract(
  'v3.storytelling.anniversary-date-operation',
  1,
  'forward_fix_only',
  false,
  null,
  'Governed exact-edition anniversary date mutation with CAS and immutable history'
);

create table if not exists public.studio2_anniversary_date_history (
  operation_id uuid primary key
    references public.studio2_operation_receipts(operation_id) on delete restrict,
  edition_id uuid not null references public.editions(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_event_date date,
  event_date date,
  previous_year integer,
  year integer,
  previous_version bigint not null check (previous_version >= 0),
  version bigint not null check (version >= previous_version),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  changed_at timestamptz not null default now()
);

create index if not exists studio2_anniversary_date_history_edition_time_idx
  on public.studio2_anniversary_date_history (edition_id, changed_at desc, operation_id);

alter table public.studio2_anniversary_date_history enable row level security;
revoke all on table public.studio2_anniversary_date_history from public, anon, authenticated;
grant select on table public.studio2_anniversary_date_history to service_role;

create or replace function private.v3_reject_anniversary_date_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $reject$
begin
  raise exception 'Anniversary date history is immutable' using errcode = '55000';
end
$reject$;

revoke all on function private.v3_reject_anniversary_date_history_mutation()
  from public, anon, authenticated;

drop trigger if exists studio2_anniversary_date_history_immutable
  on public.studio2_anniversary_date_history;
create trigger studio2_anniversary_date_history_immutable
before update or delete on public.studio2_anniversary_date_history
for each row execute function private.v3_reject_anniversary_date_history_mutation();

-- data_revision already exists as the canonical edition CAS token, but the
-- legacy event-date editor did not advance it. Make every semantic date change,
-- including any compatibility-period direct write, invalidate stale reviews.
create or replace function private.v3_bump_edition_anniversary_date_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $bump$
begin
  if new.event_date is distinct from old.event_date then
    new.data_revision := old.data_revision + 1;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_edition_anniversary_date_revision()
  from public, anon, authenticated;

drop trigger if exists editions_bump_anniversary_date_revision on public.editions;
create trigger editions_bump_anniversary_date_revision
before update of event_date on public.editions
for each row execute function private.v3_bump_edition_anniversary_date_revision();

create or replace function public.studio2_anniversary_date_preview(
  p_edition_id uuid,
  p_event_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_actor uuid := auth.uid();
  v_edition public.editions%rowtype;
  v_next_year integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not private.studio2_can_manage_storytelling(v_actor, p_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select edition.*
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Clearing an unknown exact date deliberately preserves the known calendar
  -- year. Setting a date derives the year from that date, matching the existing
  -- editions_sync_year_from_event_date invariant.
  v_next_year := case
    when p_event_date is null then v_edition.year
    else extract(year from p_event_date)::integer
  end;

  return jsonb_build_object(
    'editionId', v_edition.id,
    'editionNumber', v_edition.edition_number,
    'editionName', v_edition.name,
    'previousEventDate', v_edition.event_date,
    'eventDate', p_event_date,
    'previousYear', v_edition.year,
    'year', v_next_year,
    'expectedVersion', v_edition.data_revision,
    'changed', v_edition.event_date is distinct from p_event_date,
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_anniversary_date_preview(uuid, date)
  from public, anon, authenticated;
grant execute on function public.studio2_anniversary_date_preview(uuid, date)
  to authenticated, service_role;

create or replace function public.studio2_apply_anniversary_date(
  p_edition_id uuid,
  p_event_date date,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.editions%rowtype;
  v_after public.editions%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_expected_version is null
     or p_expected_version < 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or v_reason is null
     or length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not private.studio2_can_manage_storytelling(v_actor, p_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Claim before mutable-state validation so an uncertain/lost response can
  -- replay the original completed operation after its CAS token has advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'story.anniversary_date.set',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'edition',
      'subjectId', p_edition_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'eventDate', p_event_date,
      'expectedVersion', p_expected_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select edition.*
  into v_before
  from public.editions edition
  where edition.id = p_edition_id
  for update;

  if v_before.id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_before.data_revision is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  update public.editions edition
  set event_date = p_event_date
  where edition.id = p_edition_id
  returning edition.* into v_after;

  if p_event_date is not null
     and v_after.year is distinct from extract(year from p_event_date)::integer then
    raise exception using errcode = '23514', message = 'DATABASE';
  end if;

  insert into public.studio2_anniversary_date_history (
    operation_id,
    edition_id,
    actor_id,
    previous_event_date,
    event_date,
    previous_year,
    year,
    previous_version,
    version,
    reason
  ) values (
    v_operation_id,
    p_edition_id,
    v_actor,
    v_before.event_date,
    v_after.event_date,
    v_before.year,
    v_after.year,
    v_before.data_revision,
    v_after.data_revision,
    v_reason
  );

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', v_after.id,
    'editionNumber', v_after.edition_number,
    'editionName', v_after.name,
    'previousEventDate', v_before.event_date,
    'eventDate', v_after.event_date,
    'previousYear', v_before.year,
    'year', v_after.year,
    'previousVersion', v_before.data_revision,
    'version', v_after.data_revision,
    'operationId', v_operation_id,
    'changed', v_before.event_date is distinct from v_after.event_date
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);

  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_anniversary_date(
  uuid, date, bigint, uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.studio2_apply_anniversary_date(
  uuid, date, bigint, uuid, text, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_anniversary_date_history(
  p_edition_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $history$
declare
  v_actor uuid := auth.uid();
  v_items jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not private.studio2_can_manage_storytelling(v_actor, p_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'operationId', item.operation_id,
        'editionId', item.edition_id,
        'actorId', item.actor_id,
        'previousEventDate', item.previous_event_date,
        'eventDate', item.event_date,
        'previousYear', item.previous_year,
        'year', item.year,
        'previousVersion', item.previous_version,
        'version', item.version,
        'reason', item.reason,
        'changedAt', item.changed_at
      )
      order by item.changed_at desc, item.operation_id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select history.*
    from public.studio2_anniversary_date_history history
    where history.edition_id = p_edition_id
    order by history.changed_at desc, history.operation_id
    limit p_limit
  ) item;

  return jsonb_build_object(
    'editionId', p_edition_id,
    'items', v_items,
    'serverTime', now()
  );
end
$history$;

revoke all on function public.studio2_anniversary_date_history(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_anniversary_date_history(uuid, integer)
  to authenticated, service_role;

comment on function public.studio2_apply_anniversary_date(
  uuid, date, bigint, uuid, text, text, uuid
) is
  'System #633 canonical edition event-date command with exact-edition authorization, CAS, semantic idempotency, immutable history and durable operation reconciliation.';

notify pgrst, 'reload schema';

commit;

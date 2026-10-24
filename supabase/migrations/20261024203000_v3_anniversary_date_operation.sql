begin;

-- System #633 / Organizer O15.
-- Move the existing exact-edition Anniversary date compare-and-swap onto the
-- canonical V3 operation/idempotency/receipt boundary. The command deliberately
-- does not become a general-purpose editions update API.
select public.v3_register_migration_contract(
  'v3.anniversary-date-operation',
  1,
  'forward_fix_only',
  false,
  null,
  'Add exact-edition Anniversary date snapshot and idempotent CAS operation receipt'
);

create or replace function public.studio2_anniversary_date_snapshot(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_edition public.editions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_edition_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if public.studio2_access_allowed('edition.manage', p_edition_id, true) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select *
  into v_edition
  from public.editions
  where id = p_edition_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'editionId', v_edition.id,
    'editionNumber', v_edition.edition_number,
    'editionName', v_edition.name,
    'eventDate', v_edition.event_date,
    'year', v_edition.year,
    'serverTime', now()
  );
end
$snapshot$;

revoke all on function public.studio2_anniversary_date_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_anniversary_date_snapshot(uuid)
  to authenticated;

comment on function public.studio2_anniversary_date_snapshot(uuid) is
  'Exact-edition Organizer snapshot for reviewing an Anniversary date change. Authorization is resolved server-side.';

create or replace function public.studio2_set_anniversary_date(
  p_edition_id uuid,
  p_event_date date,
  p_expected_event_date date,
  p_expected_year integer,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
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
  v_canonical_operation_id uuid;
  v_edition public.editions%rowtype;
  v_next_year integer;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_edition_id is null or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  if public.studio2_access_allowed('edition.manage', p_edition_id, true) is not true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Claim before mutable-state validation. A retry after a committed response was
  -- lost must replay its receipt even though the edition's date/year have moved.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'edition.anniversary_date.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'edition',
      'subjectId', p_edition_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'eventDate', p_event_date,
      'expectedEventDate', p_expected_event_date,
      'expectedYear', p_expected_year,
      'reason', v_reason
    )
  );

  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_canonical_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select *
  into v_edition
  from public.editions
  where id = p_edition_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;

  if v_edition.event_date is distinct from p_expected_event_date
     or v_edition.year is distinct from p_expected_year then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  -- event_date is the exact historical date. When present, its calendar year is
  -- authoritative for editions.year. Clearing an unknown date intentionally
  -- preserves the historical year rather than erasing a separately meaningful
  -- archive attribute.
  v_next_year := case
    when p_event_date is null then v_edition.year
    else extract(year from p_event_date)::integer
  end;

  update public.editions
  set
    event_date = p_event_date,
    year = v_next_year
  where id = p_edition_id;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'editionId', p_edition_id,
    'editionNumber', v_edition.edition_number,
    'editionName', v_edition.name,
    'reason', v_reason,
    'before', jsonb_build_object(
      'eventDate', v_edition.event_date,
      'year', v_edition.year
    ),
    'after', jsonb_build_object(
      'eventDate', p_event_date,
      'year', v_next_year
    ),
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  return public.studio2_reconcile_operation(v_canonical_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_set_anniversary_date(
  uuid, date, date, integer, text, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.studio2_set_anniversary_date(
  uuid, date, date, integer, text, uuid, text, uuid
) to authenticated;

comment on function public.studio2_set_anniversary_date(
  uuid, date, date, integer, text, uuid, text, uuid
) is
  'V3 R2 exact-edition Anniversary date mutation with server authorization, reviewed-state CAS, semantic idempotency and durable receipt/reconciliation.';

notify pgrst, 'reload schema';

commit;

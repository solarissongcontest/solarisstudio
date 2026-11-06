begin;
select public.v3_register_migration_contract('v3.edition.metadata-command',1,'forward_fix_only',false,null,'Govern exact-edition metadata changes with revision CAS, semantic replay, durable receipt and event');

-- Preserve the current event vocabulary while registering this command's
-- specific audit event. Refuse an unknown constraint rather than removing it.
do $event_contract$
declare v_existing text;
begin
  select pg_get_expr(conbin,conrelid) into v_existing from pg_constraint
  where conrelid='public.studio2_contest_events'::regclass
    and conname='studio2_contest_events_type_check' and contype='c';
  if v_existing is null then raise exception 'Contest event type contract is missing'; end if;
  alter table public.studio2_contest_events drop constraint studio2_contest_events_type_check;
  execute format('alter table public.studio2_contest_events add constraint studio2_contest_events_type_check check ((%s) or type = %L)',
    v_existing,'edition.metadata_changed');
end
$event_contract$;

create or replace function public.v3_apply_edition_metadata_change(
  p_edition_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text;
  v_changed_fields jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb
     or length(coalesce(v_reason, '')) < 5 then
    raise exception 'VALIDATION: edition, expected revision, non-empty patch and reason required'
      using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition'
      using errcode = '42501';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name','description','event_date','year') then
      raise exception 'VALIDATION: % is not edition-owned metadata', v_key using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'name' and (
    jsonb_typeof(p_patch -> 'name') <> 'string'
    or length(btrim(p_patch ->> 'name')) < 1
    or length(btrim(p_patch ->> 'name')) > 160
  ) then
    raise exception 'VALIDATION: edition name must contain 1-160 characters' using errcode = '22023';
  end if;
  if p_patch ? 'description' and jsonb_typeof(p_patch -> 'description') not in ('string','null') then
    raise exception 'VALIDATION: description must be text or null' using errcode = '22023';
  end if;
  if p_patch ? 'description' and length(coalesce(p_patch ->> 'description','')) > 6000 then
    raise exception 'VALIDATION: description is too long' using errcode = '22023';
  end if;
  if p_patch ? 'year' and jsonb_typeof(p_patch -> 'year') not in ('number','null') then
    raise exception 'VALIDATION: year must be numeric or null' using errcode = '22023';
  end if;
  if p_patch ? 'event_date' and jsonb_typeof(p_patch -> 'event_date') not in ('string','null') then
    raise exception 'VALIDATION: event date must be an ISO date or null' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'edition.metadata.change', 'R1', jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expectedRevision', p_expected_revision,
      'patch', p_patch, 'reason', v_reason)
  );
  v_operation_id := (
    substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||
    substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||
    substr(v_fingerprint,21,12)
  )::uuid;
  v_claim := private.studio2_claim_operation(
    v_operation_id,
    'edition.metadata:' || v_fingerprint,
    v_operation_id,
    'edition.metadata.change',
    'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('expectedRevision', p_expected_revision, 'patch', p_patch, 'reason', v_reason)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing edition metadata operation'
        using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed', true);
  end if;

  select * into v_current
  from public.editions
  where id = p_edition_id
  for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  if v_current.data_revision <> p_expected_revision then
    raise exception 'STATE_CHANGED: edition changed since this edit was loaded' using errcode = 'PT409';
  end if;

  v_next := jsonb_populate_record(v_current, p_patch);
  if v_next.year is not null and (v_next.year < 1900 or v_next.year > 9999) then
    raise exception 'VALIDATION: edition year is outside the supported range' using errcode = '22023';
  end if;

  update public.editions
  set name = case when p_patch ? 'name' then btrim(v_next.name) else name end,
      description = case when p_patch ? 'description' then nullif(btrim(v_next.description), '') else description end,
      event_date = case when p_patch ? 'event_date' then v_next.event_date else event_date end,
      year = case when p_patch ? 'year' then v_next.year else year end,
      data_revision = data_revision + 1
  where id = p_edition_id and data_revision = p_expected_revision
  returning * into v_next;
  if not found then
    raise exception 'STATE_CHANGED: edition changed immediately before apply' using errcode = 'PT409';
  end if;

  select coalesce(jsonb_agg(to_jsonb(key) order by key), '[]'::jsonb)
  into v_changed_fields
  from jsonb_object_keys(p_patch) as fields(key);

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id, 'edition.metadata_changed', v_actor, 'edition', p_edition_id::text,
    jsonb_build_object(
      'changeKind', 'edition.metadata.change',
      'operationId', v_operation_id,
      'changedFields', v_changed_fields,
      'fromRevision', p_expected_revision,
      'toRevision', v_next.data_revision,
      'reason', v_reason
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed', 'edition', p_edition_id::text, v_next.data_revision,
    v_operation_id, p_edition_id, null,
    jsonb_build_object(
      'changeKind', 'metadata',
      'changedFields', v_changed_fields,
      'previousRevision', p_expected_revision,
      'revision', v_next.data_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'replayed', false,
    'changed', true,
    'edition', to_jsonb(v_next)
  );
  return private.studio2_complete_operation(v_operation_id, v_result);
end
$command$;

revoke all on function public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)
  to authenticated;


notify pgrst,'reload schema';
commit;

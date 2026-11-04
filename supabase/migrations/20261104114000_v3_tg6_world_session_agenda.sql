begin;

-- TG6 first vertical slice: bounded, server-owned institutional session schedule
-- and agenda. TG2 owns organization, organ, scope and immutable operation receipts.
-- No existing world authority is copied here.

insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
  ('world.session.create','world','Schedule institutional sessions','Create sessions for a scoped institutional organ.','operate'),
  ('world.session.manage','world','Manage institutional sessions','Manage sessions for a scoped institutional organ.','operate'),
  ('world.agenda.manage','world','Manage institutional agendas','Add and reorder session agenda items in scope.','operate')
on conflict (key) do nothing;

insert into public.world_office_capabilities(office_id, capability)
select office_row.id, capability_row.capability
from public.world_organization_offices office_row
cross join (values ('world.session.create'),('world.session.manage'),('world.agenda.manage')) capability_row(capability)
where office_row.slug in ('chairperson','deputy-chairperson','secretary-general','deputy-secretary-general')
on conflict do nothing;

-- Prevent assigning an organ belonging to a different organization, including
-- through privileged scripts that bypass an application command.
create unique index if not exists world_organs_id_organization_uidx
  on public.world_organization_organs(id, organization_id);

create table public.world_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid not null,
  title text not null,
  sequence_number integer not null,
  edition_id uuid references public.editions(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_type text not null,
  venue_label text,
  external_url text,
  status text not null default 'scheduled',
  chair_person_id uuid references public.delegation_people(id) on delete restrict,
  quorum_rule_snapshot jsonb,
  visibility text not null default 'public',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_sessions_organ_fkey foreign key(organ_id, organization_id)
    references public.world_organization_organs(id, organization_id) on delete restrict,
  constraint world_sessions_title_chk check(length(btrim(title)) between 1 and 180),
  constraint world_sessions_sequence_chk check(sequence_number > 0),
  constraint world_sessions_time_chk check(ends_at > starts_at),
  constraint world_sessions_venue_chk check(venue_type in ('online','external','physical','hybrid')),
  constraint world_sessions_url_chk check(external_url is null or external_url ~ '^https://[^[:space:]]+$'),
  constraint world_sessions_status_chk check(status in ('scheduled','open','recessed','concluded','cancelled','archived')),
  constraint world_sessions_visibility_chk check(visibility in ('public','members','private')),
  constraint world_sessions_quorum_chk check(quorum_rule_snapshot is null or jsonb_typeof(quorum_rule_snapshot) = 'object'),
  constraint world_sessions_revision_chk check(revision >= 1),
  unique(organ_id,sequence_number)
);
create index world_sessions_public_schedule_idx
  on public.world_sessions(starts_at desc,organization_id)
  where visibility = 'public';

create table public.world_agenda_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.world_sessions(id) on delete restrict,
  position integer not null,
  item_type text not null,
  title text not null,
  description text,
  subject_type text,
  subject_id uuid,
  sponsor_country_id uuid references public.countries(id) on delete restrict,
  state text not null default 'draft',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_agenda_position_chk check(position > 0),
  constraint world_agenda_title_chk check(length(btrim(title)) between 1 and 180),
  constraint world_agenda_item_type_chk check(item_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint world_agenda_subject_pair_chk check((subject_type is null) = (subject_id is null)),
  constraint world_agenda_subject_type_chk check(subject_type is null or subject_type ~ '^[a-z][a-z0-9_.]{0,79}$'),
  constraint world_agenda_state_chk check(state in ('draft','scheduled','active','postponed','completed','withdrawn')),
  constraint world_agenda_revision_chk check(revision >= 1),
  constraint world_agenda_session_position_unique unique(session_id, position)
    deferrable initially deferred
);
create index world_agenda_items_session_idx on public.world_agenda_items(session_id,position);

alter table public.world_sessions enable row level security;
alter table public.world_agenda_items enable row level security;
revoke all on public.world_sessions,public.world_agenda_items
  from public,anon,authenticated;
-- Only authorized functions can read or mutate. The public projection filters
-- visibility and agenda publication independently, not by relying on RLS bypass.
revoke all on public.world_sessions, public.world_agenda_items from service_role;

create or replace function public.world_session_schedule_v1(p_organization_slug text default null)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $schedule$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'organizationSlug',o.slug,'organizationName',o.short_name,
    'organName',g.name,'title',s.title,'sequenceNumber',s.sequence_number,
    'startsAt',s.starts_at,'endsAt',s.ends_at,'status',s.status,
    'venueType',s.venue_type,'venueLabel',s.venue_label,'revision',s.revision
  ) order by s.starts_at desc,s.id), '[]'::jsonb)
  from (
    select *
    from public.world_sessions s
    where s.visibility = 'public'
      and s.status <> 'cancelled'
      and (p_organization_slug is null or exists (
        select 1 from public.world_organizations os
        where os.id = s.organization_id and os.slug = lower(btrim(p_organization_slug))
      ))
    order by s.starts_at desc,s.id
    limit 100
  ) s
  join public.world_organizations o on o.id = s.organization_id and o.public_visibility = 'public'
  join public.world_organization_organs g on g.id = s.organ_id
    and g.organization_id = s.organization_id and g.visibility = 'public'
$schedule$;

create or replace function public.world_session_detail_v1(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $detail$
  select jsonb_build_object(
    'id',s.id,'organizationSlug',o.slug,'organizationName',o.official_name,
    'organName',g.name,'title',s.title,'sequenceNumber',s.sequence_number,
    'startsAt',s.starts_at,'endsAt',s.ends_at,'status',s.status,
    'venueType',s.venue_type,'venueLabel',s.venue_label,
    'externalUrl',s.external_url,'revision',s.revision,
    'agenda',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'position',a.position,'itemType',a.item_type,
        'title',a.title,'description',a.description,'state',a.state
      ) order by a.position)
      from public.world_agenda_items a
      where a.session_id = s.id and a.state in ('scheduled','active','postponed','completed')
    ), '[]'::jsonb)
  )
  from public.world_sessions s
  join public.world_organizations o on o.id = s.organization_id and o.public_visibility = 'public'
  join public.world_organization_organs g on g.id = s.organ_id
    and g.organization_id = s.organization_id and g.visibility = 'public'
  where s.id = p_session_id and s.visibility = 'public'
$detail$;

-- Private managing projection is separate from anonymous public agenda; only
-- the same scoped capability used for writes may read drafts.
create or replace function public.world_session_manage_v1(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $manage$
declare v_session public.world_sessions%rowtype;
begin
  select * into v_session from public.world_sessions where id = p_session_id;
  if v_session.id is null or not public.world_access_allowed(
    'world.agenda.manage',v_session.organization_id,null,v_session.organ_id,null,null
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  return jsonb_build_object(
    'id',v_session.id,'revision',v_session.revision,
    'status',v_session.status,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'position',a.position,'title',a.title,
        'state',a.state,'revision',a.revision
      ) order by a.position)
      from public.world_agenda_items a where a.session_id = p_session_id
    ), '[]'::jsonb)
  );
end
$manage$;

create or replace function public.world_session_create_v1(
  p_organization_id uuid,p_organ_id uuid,p_title text,
  p_starts_at timestamptz,p_ends_at timestamptz,
  p_venue_type text,p_venue_label text,p_external_url text,
  p_edition_id uuid,p_operation_id uuid,p_idempotency_key text,
  p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $create$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_sequence integer;
  v_session_id uuid;
  v_result jsonb;
begin
  if not public.world_access_allowed(
    'world.session.create',p_organization_id,null,p_organ_id,null,null
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if p_organization_id is null or p_organ_id is null or
     nullif(btrim(p_title),'') is null or length(btrim(p_title)) > 180 or
     p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or
     p_venue_type is null or
     p_venue_type not in ('online','external','physical','hybrid') or
     (p_external_url is not null and p_external_url !~ '^https://[^[:space:]]+$')
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  -- Serialize sequence allocation inside the organ. This also validates the
  -- organization/organ pair and prevents duplicate numbers under concurrency.
  perform 1 from public.world_organization_organs
  where id=p_organ_id and organization_id=p_organization_id
  for update;
  if not found then raise exception using errcode='23503',message='INVALID_ORGAN'; end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.session.create','R2',
    jsonb_build_object('organizationId',p_organization_id,'organId',p_organ_id,
      'subjectType','world_session'),
    jsonb_build_object('title',btrim(p_title),'startsAt',p_starts_at,
      'endsAt',p_ends_at,'venueType',p_venue_type,'venueLabel',p_venue_label,
      'externalUrl',p_external_url,'editionId',p_edition_id)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  if p_starts_at < now() - interval '5 minutes' then
    raise exception using errcode='22023',message='PAST_SESSION_START';
  end if;
  select coalesce(max(sequence_number),0)+1 into v_sequence
  from public.world_sessions where organ_id=p_organ_id;
  insert into public.world_sessions(
    organization_id,organ_id,title,sequence_number,starts_at,ends_at,
    venue_type,venue_label,external_url,edition_id,visibility
  ) values (
    p_organization_id,p_organ_id,btrim(p_title),v_sequence,p_starts_at,p_ends_at,
    p_venue_type,nullif(btrim(coalesce(p_venue_label,'')),''),
    nullif(btrim(coalesce(p_external_url,'')),''),p_edition_id,'public'
  ) returning id into v_session_id;
  perform private.v3_emit_domain_event(
    'world.session.created','world_session',v_session_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('organizationId',p_organization_id,'organId',p_organ_id,
      'sessionId',v_session_id,'sequenceNumber',v_sequence),1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'sessionId',v_session_id,
    'revision',1,'sequenceNumber',v_sequence,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$create$;

create or replace function public.world_agenda_append_v1(
  p_session_id uuid,p_title text,p_item_type text,p_description text,
  p_publish boolean,p_expected_revision bigint,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $append$
declare
  v_session public.world_sessions%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_item_id uuid;
  v_position integer;
  v_result jsonb;
begin
  select * into v_session from public.world_sessions where id=p_session_id for update;
  if v_session.id is null or not public.world_access_allowed(
    'world.agenda.manage',v_session.organization_id,null,v_session.organ_id,null,null
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if nullif(btrim(p_title),'') is null or length(btrim(p_title)) > 180 or
     p_item_type is null or p_item_type !~ '^[a-z][a-z0-9_]{0,39}
    raise exception using errcode='22023',message='VALIDATION'; end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.agenda.append','R2',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_agenda_item'),
    jsonb_build_object('title',btrim(p_title),'itemType',p_item_type,
      'description',p_description,'publish',p_publish,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  -- Replays must succeed even after this session revision advances.
  if v_session.status not in ('scheduled','open','recessed') then
    raise exception using errcode='23514',message='STATE_CHANGED'; end if;
  if p_expected_revision is null or p_expected_revision <> v_session.revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  select coalesce(max(position),0)+1 into v_position
  from public.world_agenda_items where session_id=p_session_id;
  insert into public.world_agenda_items(session_id,position,item_type,title,description,state)
  values(p_session_id,v_position,p_item_type,btrim(p_title),
    nullif(btrim(coalesce(p_description,'')),''),
    case when coalesce(p_publish,false) then 'scheduled' else 'draft' end)
  returning id into v_item_id;
  update public.world_sessions set revision=revision+1,updated_at=now()
  where id=p_session_id;
  perform private.v3_emit_domain_event(
    'world.agenda.appended','world_session',p_session_id::text,
    v_session.revision+1,v_operation_id,null,null,
    jsonb_build_object('sessionId',p_session_id,'itemId',v_item_id,
      'published',coalesce(p_publish,false)),1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'sessionId',p_session_id,
    'itemId',v_item_id,'position',v_position,'revision',v_session.revision+1,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$append$;

create or replace function public.world_agenda_reorder_v1(
  p_session_id uuid,p_item_ids uuid[],p_expected_revision bigint,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $reorder$
declare
  v_session public.world_sessions%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_expected integer;
  v_provided integer;
  v_result jsonb;
begin
  select * into v_session from public.world_sessions where id=p_session_id for update;
  if v_session.id is null or not public.world_access_allowed(
    'world.agenda.manage',v_session.organization_id,null,v_session.organ_id,null,null
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  select count(*) into v_expected from public.world_agenda_items where session_id=p_session_id;
  select count(*) into v_provided from unnest(p_item_ids) as item(id);
  if p_item_ids is null or v_provided <> v_expected
     or (select count(distinct item.id) from unnest(p_item_ids) as item(id)) <> v_provided
     or exists (
       select 1 from unnest(p_item_ids) as item(id)
       where item.id is null or not exists (
         select 1 from public.world_agenda_items a
         where a.id=item.id and a.session_id=p_session_id
       )
     )
  then raise exception using errcode='22023',message='INVALID_AGENDA_ORDER'; end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.agenda.reorder','R2',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_session'),
    jsonb_build_object('itemIds',to_jsonb(p_item_ids),'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  -- This guard follows the idempotency replay decision.
  if v_session.status not in ('scheduled','open','recessed') then
    raise exception using errcode='23514',message='STATE_CHANGED'; end if;
  if p_expected_revision is null or p_expected_revision <> v_session.revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  update public.world_agenda_items a
  set position=ordered.position,revision=a.revision+1,updated_at=now()
  from unnest(p_item_ids) with ordinality as ordered(id,position)
  where a.id=ordered.id and a.session_id=p_session_id;
  update public.world_sessions set revision=revision+1,updated_at=now()
  where id=p_session_id;
  perform private.v3_emit_domain_event(
    'world.agenda.reordered','world_session',p_session_id::text,
    v_session.revision+1,v_operation_id,null,null,
    jsonb_build_object('sessionId',p_session_id,'items',v_provided),1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'sessionId',p_session_id,
    'revision',v_session.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$reorder$;

revoke all on function public.world_session_schedule_v1(text),
  public.world_session_detail_v1(uuid), public.world_session_manage_v1(uuid),
  public.world_session_create_v1(uuid,uuid,text,timestamptz,timestamptz,text,text,text,uuid,uuid,text,uuid),
  public.world_agenda_append_v1(uuid,text,text,text,boolean,bigint,uuid,text,uuid),
  public.world_agenda_reorder_v1(uuid,uuid[],bigint,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.world_session_schedule_v1(text),
  public.world_session_detail_v1(uuid) to anon,authenticated,service_role;
grant execute on function public.world_session_manage_v1(uuid),
  public.world_session_create_v1(uuid,uuid,text,timestamptz,timestamptz,text,text,text,uuid,uuid,text,uuid),
  public.world_agenda_append_v1(uuid,text,text,text,boolean,bigint,uuid,text,uuid),
  public.world_agenda_reorder_v1(uuid,uuid[],bigint,uuid,text,uuid)
to authenticated;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg6.world-session-agenda',1,'forward_fix_only',false,null,
     'Server-authorized world session scheduling and agenda CAS with public-safe read projections.'
   );
 end if;
end
$contract$;

notify pgrst,'reload schema';
commit;
 then
    raise exception using errcode='22023',message='VALIDATION'; end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.agenda.append','R2',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_agenda_item'),
    jsonb_build_object('title',btrim(p_title),'itemType',p_item_type,
      'description',p_description,'publish',p_publish,
      'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  select coalesce(max(position),0)+1 into v_position
  from public.world_agenda_items where session_id=p_session_id;
  insert into public.world_agenda_items(session_id,position,item_type,title,description,state)
  values(p_session_id,v_position,p_item_type,btrim(p_title),
    nullif(btrim(coalesce(p_description,'')),''),
    case when coalesce(p_publish,false) then 'scheduled' else 'draft' end)
  returning id into v_item_id;
  update public.world_sessions set revision=revision+1,updated_at=now()
  where id=p_session_id;
  perform private.v3_emit_domain_event(
    'world.agenda.appended','world_session',p_session_id::text,
    v_session.revision+1,v_operation_id,null,null,
    jsonb_build_object('sessionId',p_session_id,'itemId',v_item_id,
      'published',coalesce(p_publish,false)),1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'sessionId',p_session_id,
    'itemId',v_item_id,'position',v_position,'revision',v_session.revision+1,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$append$;

create or replace function public.world_agenda_reorder_v1(
  p_session_id uuid,p_item_ids uuid[],p_expected_revision bigint,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $reorder$
declare
  v_session public.world_sessions%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_expected integer;
  v_provided integer;
  v_result jsonb;
begin
  select * into v_session from public.world_sessions where id=p_session_id for update;
  if v_session.id is null or not public.world_access_allowed(
    'world.agenda.manage',v_session.organization_id,null,v_session.organ_id,null,null
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if v_session.status not in ('scheduled','open','recessed') then
    raise exception using errcode='23514',message='STATE_CHANGED'; end if;
  if p_expected_revision is null or p_expected_revision <> v_session.revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  select count(*) into v_expected from public.world_agenda_items where session_id=p_session_id;
  select count(*) into v_provided from unnest(p_item_ids) item;
  if p_item_ids is null or v_provided <> v_expected
     or (select count(distinct item) from unnest(p_item_ids) item) <> v_provided
     or exists (
       select 1 from unnest(p_item_ids) item
       where item is null or not exists (
         select 1 from public.world_agenda_items a
         where a.id=item and a.session_id=p_session_id
       )
     )
  then raise exception using errcode='22023',message='INVALID_AGENDA_ORDER'; end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.agenda.reorder','R2',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_session'),
    jsonb_build_object('itemIds',to_jsonb(p_item_ids),'expectedRevision',p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  update public.world_agenda_items a
  set position=ordered.position,revision=a.revision+1,updated_at=now()
  from unnest(p_item_ids) with ordinality as ordered(id,position)
  where a.id=ordered.id and a.session_id=p_session_id;
  update public.world_sessions set revision=revision+1,updated_at=now()
  where id=p_session_id;
  perform private.v3_emit_domain_event(
    'world.agenda.reordered','world_session',p_session_id::text,
    v_session.revision+1,v_operation_id,null,null,
    jsonb_build_object('sessionId',p_session_id,'items',v_provided),1,array[]::text[]
  );
  v_result := jsonb_build_object('ok',true,'sessionId',p_session_id,
    'revision',v_session.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$reorder$;

revoke all on function public.world_session_schedule_v1(text),
  public.world_session_detail_v1(uuid), public.world_session_manage_v1(uuid),
  public.world_session_create_v1(uuid,uuid,text,timestamptz,timestamptz,text,text,text,uuid,uuid,text,uuid),
  public.world_agenda_append_v1(uuid,text,text,text,boolean,bigint,uuid,text,uuid),
  public.world_agenda_reorder_v1(uuid,uuid[],bigint,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.world_session_schedule_v1(text),
  public.world_session_detail_v1(uuid) to anon,authenticated,service_role;
grant execute on function public.world_session_manage_v1(uuid),
  public.world_session_create_v1(uuid,uuid,text,timestamptz,timestamptz,text,text,text,uuid,uuid,text,uuid),
  public.world_agenda_append_v1(uuid,text,text,text,boolean,bigint,uuid,text,uuid),
  public.world_agenda_reorder_v1(uuid,uuid[],bigint,uuid,text,uuid)
to authenticated;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg6.world-session-agenda',1,'forward_fix_only',false,null,
     'Server-authorized world session scheduling and agenda CAS with public-safe read projections.'
   );
 end if;
end
$contract$;

notify pgrst,'reload schema';
commit;

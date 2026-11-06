begin;

-- WORLD-09 TG16 fictional officials and domestic office terms.
-- Unlike TG2 international officials, lore characters must never be treated
-- as delegation_people or login identities. country_accounts controls writes.
create table public.world_lore_people (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  native_name text check (native_name is null or length(native_name) <= 160),
  biography text check (biography is null or length(biography) <= 4000),
  public_summary text check (public_summary is null or length(public_summary) <= 600),
  status text not null default 'unknown'
    check (status in ('active','deceased','historical','unknown')),
  born_on date,
  died_on date,
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_lore_people_dates check (died_on is null or born_on is null or died_on >= born_on),
  unique (id,country_id)
);
create index world_lore_people_country_idx
  on public.world_lore_people(country_id,name,id);

create table public.world_domestic_offices (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  office_type text not null default 'other'
    check (office_type in ('head_of_state','head_of_government','minister',
      'legislative','judicial','monarch','other')),
  description text check (description is null or length(description) <= 4000),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,country_id)
);
create index world_domestic_offices_country_idx
  on public.world_domestic_offices(country_id,title,id);

create table public.world_domestic_office_terms (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  office_id uuid not null,
  holder_person_id uuid not null,
  -- Canonical presentation SNAPSHOTS. Later person/office renames cannot rewrite history.
  holder_display_name text not null,
  office_title text not null,
  started_at timestamptz not null,
  actual_end_at timestamptz,
  appointment_method text check (appointment_method is null or length(appointment_method) <= 120),
  reason_started text check (reason_started is null or length(reason_started) <= 500),
  reason_ended text check (reason_ended is null or length(reason_ended) <= 500),
  status text not null default 'active'
    check (status in ('active','ended','resigned','removed')),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(office_id,country_id) references public.world_domestic_offices(id,country_id) on delete restrict,
  foreign key(holder_person_id,country_id) references public.world_lore_people(id,country_id) on delete restrict,
  constraint world_domestic_term_dates check (actual_end_at is null or actual_end_at > started_at),
  constraint world_domestic_term_state check (
    (status='active' and actual_end_at is null)
    or (status in ('ended','resigned','removed') and actual_end_at is not null)
  )
);
create unique index world_domestic_office_one_open_uidx
  on public.world_domestic_office_terms(office_id)
  where actual_end_at is null;
create index world_domestic_office_history_idx
  on public.world_domestic_office_terms(country_id,started_at desc,id);

create table public.world_domestic_official_revisions (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('lore_person','office','term')),
  record_id uuid not null,
  country_id uuid not null references public.countries(id) on delete restrict,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null,
  operation_id uuid not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique(record_type,record_id,revision),
  unique(operation_id)
);
create index world_domestic_official_revisions_idx
  on public.world_domestic_official_revisions(country_id,changed_at desc);

alter table public.world_lore_people enable row level security;
alter table public.world_domestic_offices enable row level security;
alter table public.world_domestic_office_terms enable row level security;
alter table public.world_domestic_official_revisions enable row level security;
revoke all on public.world_lore_people,public.world_domestic_offices,
  public.world_domestic_office_terms,public.world_domestic_official_revisions
  from public,anon,authenticated;
grant select on public.world_lore_people,public.world_domestic_offices,
  public.world_domestic_office_terms,public.world_domestic_official_revisions to service_role;

create function public.world_write_domestic_official_v1(
  p_country_id uuid, p_kind text,p_subject_id uuid,p_payload jsonb,
  p_expected_revision bigint,p_operation_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $command$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation uuid;
  v_record uuid;
  v_revision bigint;
  v_name text := nullif(btrim(p_payload ->> 'name'),'');
  v_native_name text := nullif(btrim(p_payload ->> 'nativeName'),'');
  v_public_summary text := nullif(btrim(p_payload ->> 'publicSummary'),'');
  v_person_status text := coalesce(nullif(p_payload ->> 'status',''),'unknown');
  v_born_on date;
  v_died_on date;
  v_description text := nullif(btrim(p_payload ->> 'description'),'');
  v_title text := nullif(btrim(p_payload ->> 'title'),'');
  v_visible boolean;
  v_office_type text;
  v_office uuid;
  v_holder uuid;
  v_office_title text;
  v_holder_name text;
  v_started timestamptz;
  v_ended timestamptz;
  v_status text;
  v_receipt jsonb;
begin
  if v_actor is null or p_country_id is null or not exists(
    select 1 from public.country_accounts ca
    where ca.country_id=p_country_id and ca.user_id=v_actor and ca.status='active'
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if p_kind not in ('lore_person','office','term_start','term_end','term_publish')
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or pg_column_size(p_payload)>16384
    or p_expected_revision is null or p_expected_revision<0
    or p_operation_id is null
    or length(coalesce(p_idempotency_key,'')) not between 8 and 200
    or coalesce(p_payload ->> 'published','false') not in ('true','false') then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  v_visible := coalesce((p_payload ->> 'published')::boolean,false);
  if length(coalesce(v_description,''))>4000 then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  perform 1 from public.country_accounts ca where ca.country_id=p_country_id
    and ca.user_id=v_actor and ca.status='active' for update;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.domestic.'||p_kind,'R2',
    jsonb_build_object('countryId',p_country_id,'subjectType','country'),
    jsonb_build_object('countryId',p_country_id,'subjectId',p_subject_id,
      'kind',p_kind,'revision',p_expected_revision,'payload',p_payload)
  );
  v_operation := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation)
      || jsonb_build_object('replayed',true);
  end if;

  if p_kind='lore_person' then
    if v_name is null or length(v_name)>160
      or length(coalesce(v_native_name,''))>160
      or length(coalesce(v_public_summary,''))>600
      or v_person_status not in ('active','deceased','historical','unknown') then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    v_born_on := nullif(p_payload ->> 'bornOn','')::date;
    v_died_on := nullif(p_payload ->> 'diedOn','')::date;
    if v_born_on is not null and v_died_on is not null and v_died_on<v_born_on then
      raise exception using errcode='22023',message='INVALID_LORE_LIFESPAN';
    end if;
    if p_subject_id is null then
      if p_expected_revision<>0 or
        (select count(*) from public.world_lore_people where country_id=p_country_id)>=100 then
        raise exception using errcode='22023',message='PERSON_LIMIT_OR_REVISION';
      end if;
      insert into public.world_lore_people(
        country_id,name,native_name,biography,public_summary,status,
        born_on,died_on,visibility
      ) values(
        p_country_id,v_name,v_native_name,v_description,v_public_summary,
        v_person_status,v_born_on,v_died_on,
        case when v_visible then 'public' else 'draft' end
      ) returning id,revision into v_record,v_revision;
    else
      if not v_visible and exists (
        select 1 from public.world_domestic_office_terms t
        where t.holder_person_id=p_subject_id and t.country_id=p_country_id
          and t.visibility='public'
      ) then
        raise exception using errcode='23514',message='PUBLISHED_TERM_REQUIRES_PERSON';
      end if;
      update public.world_lore_people set
        name=v_name,native_name=v_native_name,biography=v_description,
        public_summary=v_public_summary,status=v_person_status,
        born_on=v_born_on,died_on=v_died_on,
        visibility=case when v_visible then 'public' else 'draft' end,
        revision=revision+1,updated_at=now()
      where id=p_subject_id and country_id=p_country_id
        and revision=p_expected_revision
      returning id,revision into v_record,v_revision;
      if v_record is null then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
    end if;
  elsif p_kind='office' then
    v_office_type := coalesce(nullif(p_payload ->> 'officeType',''),'other');
    if v_title is null or length(v_title)>160
       or v_office_type not in ('head_of_state','head_of_government','minister',
         'legislative','judicial','monarch','other') then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    if p_subject_id is null then
      if p_expected_revision<>0 or
        (select count(*) from public.world_domestic_offices where country_id=p_country_id)>=50 then
        raise exception using errcode='22023',message='OFFICE_LIMIT_OR_REVISION';
      end if;
      insert into public.world_domestic_offices(
        country_id,title,office_type,description,visibility
      ) values (
        p_country_id,v_title,v_office_type,v_description,
        case when v_visible then 'public' else 'draft' end
      ) returning id,revision into v_record,v_revision;
    else
      if not v_visible and exists (
        select 1 from public.world_domestic_office_terms t
        where t.office_id=p_subject_id and t.country_id=p_country_id
          and t.visibility='public'
      ) then
        raise exception using errcode='23514',message='PUBLISHED_TERM_REQUIRES_OFFICE';
      end if;
      update public.world_domestic_offices set
        title=v_title,office_type=v_office_type,description=v_description,
        visibility=case when v_visible then 'public' else 'draft' end,
        revision=revision+1,updated_at=now()
      where id=p_subject_id and country_id=p_country_id and revision=p_expected_revision
      returning id,revision into v_record,v_revision;
      if v_record is null then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
    end if;
  elsif p_kind='term_start' then
    if p_subject_id is not null or p_expected_revision<>0 then
      raise exception using errcode='40001',message='VERSION_CONFLICT';
    end if;
    if nullif(p_payload ->> 'officeId','') is null
       or nullif(p_payload ->> 'holderPersonId','') is null
       or nullif(p_payload ->> 'startedAt','') is null then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    v_office := (p_payload ->> 'officeId')::uuid;
    v_holder := (p_payload ->> 'holderPersonId')::uuid;
    v_started := (p_payload ->> 'startedAt')::timestamptz;
    v_ended := nullif(p_payload ->> 'endedAt','')::timestamptz;
    if v_started>now() or (v_ended is not null and
      (v_ended<=v_started or v_ended>now())) then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    v_status := case when v_ended is null then 'active' else 'ended' end;
    select o.title into v_office_title from public.world_domestic_offices o
      where o.id=v_office and o.country_id=p_country_id
        and (not v_visible or o.visibility='public');
    select p.name into v_holder_name from public.world_lore_people p
      where p.id=v_holder and p.country_id=p_country_id
        and (not v_visible or p.visibility='public');
    if v_office_title is null or v_holder_name is null then
      raise exception using errcode='23503',message='OFFICE_OR_LORE_PERSON_NOT_PUBLISHED';
    end if;
    if (select count(*) from public.world_domestic_office_terms t
        where t.country_id=p_country_id)>=500 then
      raise exception using errcode='22023',message='OFFICE_TERM_LIMIT';
    end if;
    -- A country may import closed historical terms. Intervals cannot overlap
    -- for the same office; a currently active term has no end until transition.
    if exists (
      select 1 from public.world_domestic_office_terms t
      where t.office_id=v_office
        and tstzrange(t.started_at,t.actual_end_at,'[)')
            && tstzrange(v_started,v_ended,'[)')
    ) then
      raise exception using errcode='23505',message='OVERLAPPING_OFFICE_TERM';
    end if;
    insert into public.world_domestic_office_terms(
      country_id,office_id,holder_person_id,holder_display_name,office_title,
      started_at,actual_end_at,status,visibility,appointment_method,reason_started,
      operation_id
    ) values (
      p_country_id,v_office,v_holder,v_holder_name,v_office_title,
      v_started,v_ended,v_status,case when v_visible then 'public' else 'draft' end,
      left(nullif(btrim(p_payload ->> 'appointmentMethod'),''),120),
      left(nullif(btrim(p_payload ->> 'reasonStarted'),''),500),v_operation
    ) returning id,revision into v_record,v_revision;
  elsif p_kind='term_publish' then
    if p_subject_id is null or p_expected_revision<1
       or not v_visible then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    update public.world_domestic_office_terms t set
      visibility='public',revision=t.revision+1,updated_at=now()
    from public.world_domestic_offices o, public.world_lore_people p
    where t.id=p_subject_id and t.country_id=p_country_id
      and t.revision=p_expected_revision and t.visibility='draft'
      and o.id=t.office_id and o.country_id=p_country_id and o.visibility='public'
      and p.id=t.holder_person_id and p.country_id=p_country_id and p.visibility='public'
    returning t.id,t.revision into v_record,v_revision;
    if v_record is null then
      raise exception using errcode='40001',message='VERSION_CONFLICT_OR_PARENT_UNPUBLISHED';
    end if;
  else
    if p_subject_id is null or p_expected_revision<1 then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    v_status := coalesce(p_payload ->> 'status','ended');
    if v_status not in ('ended','resigned','removed') then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    update public.world_domestic_office_terms t set
      actual_end_at=now(),status=v_status,
      reason_ended=left(nullif(btrim(p_payload ->> 'reasonEnded'),''),500),
      revision=revision+1,updated_at=now()
    where t.id=p_subject_id and t.country_id=p_country_id
      and t.status='active' and t.actual_end_at is null
      and t.revision=p_expected_revision
    returning id,revision into v_record,v_revision;
    if v_record is null then
      raise exception using errcode='40001',message='VERSION_CONFLICT';
    end if;
  end if;

  insert into public.world_domestic_official_revisions(
    record_type,record_id,country_id,revision,snapshot,operation_id,changed_by
  ) values (
    case when p_kind in ('term_start','term_end') then 'term' else p_kind end,
    v_record,p_country_id,v_revision,
    case p_kind when 'lore_person' then
      (select to_jsonb(p) from public.world_lore_people p where p.id=v_record)
      when 'office' then
      (select to_jsonb(o) from public.world_domestic_offices o where o.id=v_record)
      else
      (select to_jsonb(t) from public.world_domestic_office_terms t where t.id=v_record)
    end,v_operation,v_actor
  );
  perform private.v3_emit_domain_event(
    'world.domestic_'||p_kind||'.changed','world_domestic_official',
    v_record::text,v_revision,v_operation,null,null,
    jsonb_build_object('countryId',p_country_id,'id',v_record,
      'revision',v_revision,'kind',p_kind),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'countryId',p_country_id,
    'kind',p_kind,'id',v_record,'revision',v_revision,'operationId',v_operation);
  perform private.studio2_complete_operation(v_operation,v_receipt);
  return public.studio2_reconcile_operation(v_operation)
    || jsonb_build_object('replayed',false);
end
$command$;
revoke all on function public.world_write_domestic_official_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.world_write_domestic_official_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) to authenticated,service_role;

create function public.world_domestic_officials_v1(p_country_code text)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public
as $reader$
  select jsonb_build_object(
    'countryId',c.id,'countryCode',c.short_code,
    'isController',exists(select 1 from public.country_accounts ca
      where ca.country_id=c.id and ca.user_id=auth.uid() and ca.status='active'),
    'people',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'displayName',p.name,'nativeName',p.native_name,
        'biography',p.biography,'publicSummary',p.public_summary,
        'status',p.status,'bornOn',p.born_on,'diedOn',p.died_on,
        'published',p.visibility='public','revision',p.revision)
        order by p.name,p.id)
      from public.world_lore_people p where p.country_id=c.id
      and (p.visibility='public' or exists(
        select 1 from public.country_accounts ca where ca.user_id=auth.uid()
          and ca.country_id=c.id and ca.status='active'))
    ),'[]'::jsonb),
    'offices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'title',o.title,'officeType',o.office_type,
        'description',o.description,'published',o.visibility='public',
        'revision',o.revision) order by o.title,o.id)
      from public.world_domestic_offices o where o.country_id=c.id
      and (o.visibility='public' or exists(
        select 1 from public.country_accounts ca where ca.user_id=auth.uid()
          and ca.country_id=c.id and ca.status='active'))
    ),'[]'::jsonb),
    'terms',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'officeId',t.office_id,'holderPersonId',t.holder_person_id,
        'officeTitle',t.office_title,'holderDisplayName',t.holder_display_name,
        'startedAt',t.started_at,'endedAt',t.actual_end_at,
        'status',t.status,'published',t.visibility='public',
        'revision',t.revision) order by t.started_at desc,t.id)
      from public.world_domestic_office_terms t where t.country_id=c.id
      and (t.visibility='public' or exists(
        select 1 from public.country_accounts ca where ca.user_id=auth.uid()
          and ca.country_id=c.id and ca.status='active'))
    ),'[]'::jsonb)
  )
  from public.countries c
  where lower(c.short_code)=lower(btrim(p_country_code))
    and length(btrim(p_country_code)) between 2 and 12
  limit 1
$reader$;
revoke all on function public.world_domestic_officials_v1(text)
  from public,anon,authenticated;
grant execute on function public.world_domestic_officials_v1(text)
  to anon,authenticated,service_role;

-- TG17 derives domestic office transitions from the actual term authority.
-- The generated history is not a second editable source of truth.
create or replace function public.world_history_timeline_v1(
  p_page integer default 0, p_country_code text default null
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $history$
declare
  v_rows jsonb;
  v_has_more boolean;
begin
  if p_page is null or p_page < 0 or p_page > 100
     or (p_country_code is not null and (
       length(btrim(p_country_code)) not between 2 and 12
       or p_country_code !~ '^[[:alnum:]-]+$')) then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select
    coalesce(
      jsonb_agg(to_jsonb(n) - 'rn'
        order by n.occurred_at desc, n.id desc) filter (where n.rn <= 20),
      '[]'::jsonb),
    count(*) > 20
  into v_rows, v_has_more
  from (
    select l.*, row_number() over (order by l.occurred_at desc,l.id desc) as rn
    from (
      select source_records.*
      from (
        select ('editorial:'||h.id::text) as id,h.occurred_at,
          h.title,h.summary,'editorial'::text as source_type,
          'world_history_events'::text as provenance,
          c.short_code as country_code,null::text as organization_slug
        from public.world_history_events h
        join public.countries c on c.id=h.country_id
        where h.visibility='public' and h.occurred_at<=now()
          and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
        union all
        select ('election:'||e.id::text),(e.held_on::timestamp at time zone 'UTC'),
          e.title,e.result_summary,'domestic_election',
          'world_domestic_elections',c.short_code,null::text
        from public.world_domestic_elections e
        join public.countries c on c.id=e.country_id
        where e.visibility='public' and e.held_on<=current_date
          and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
        union all
        select ('office-start:'||t.id::text),t.started_at,
          t.holder_display_name || ' appointed ' || t.office_title,
          'A published domestic office term began.',
          'domestic_office','world_domestic_office_terms',c.short_code,null::text
        from public.world_domestic_office_terms t
        join public.countries c on c.id=t.country_id
        where t.visibility='public' and t.started_at<=now()
          and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
        union all
        select ('office-end:'||t.id::text),t.actual_end_at,
          t.holder_display_name || ' left the office of ' || t.office_title,
          'A published domestic office term concluded.',
          'domestic_office','world_domestic_office_terms',c.short_code,null::text
        from public.world_domestic_office_terms t
        join public.countries c on c.id=t.country_id
        where t.visibility='public' and t.actual_end_at is not null
          and t.actual_end_at<=now()
          and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
        union all
        select ('organization:'||o.id::text),o.recognized_at,
          o.official_name || ' recognized',
          coalesce(o.description,'Official institution of Terra Solaris.'),
          'institutional','world_organizations',null::text,o.slug
        from public.world_organizations o
        where p_country_code is null and o.public_visibility='public'
          and o.status in ('recognized','active','suspended','historical','dissolved')
          and o.recognized_at is not null and o.recognized_at<=now()
      ) source_records
      order by source_records.occurred_at desc,source_records.id desc
      limit 21 offset p_page*20
    ) l
  ) n;
  return jsonb_build_object('events',v_rows,'page',p_page,
    'pageSize',20,'hasMore',v_has_more);
end
$history$;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg16.domestic-lore-offices',1,'forward_fix_only',false,null,
      'Add fiction-only lore persons, nationally controlled offices and durable historical terms with published projections. Current real controllers remain country_accounts; no delegation_people or authenticated electorate is created.'
    );
  end if;
end
$contract$;
notify pgrst,'reload schema';
commit;

begin;

-- WORLD-09 TG16 optional domestic fictional lawmaking. This is lore authored
-- by the real country controller, NOT Terra Solaris TG7/TG8 official voting.
create table public.world_domestic_measures (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  process_kind text not null check (process_kind in ('democratic','monarchical','decree')),
  status text not null default 'draft'
    check (status in ('draft','introduced','debated','adopted','rejected',
      'proposed','council','assented','vetoed','issued','enacted','withdrawn')),
  visibility text not null default 'draft'
    check (visibility in ('draft','public')),
  current_version bigint not null default 1 check (current_version > 0),
  public_version_floor bigint
    check (public_version_floor is null or
      (public_version_floor>0 and public_version_floor<=current_version)),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,country_id)
);
create index world_domestic_measures_country_idx
  on public.world_domestic_measures(country_id,updated_at desc,id);

create table public.world_domestic_measure_versions (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null,
  country_id uuid not null references public.countries(id) on delete restrict,
  version_number bigint not null check (version_number > 0),
  title_snapshot text not null,
  body text not null check (length(btrim(body)) between 1 and 15000),
  operation_id uuid not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(measure_id,country_id)
    references public.world_domestic_measures(id,country_id) on delete restrict,
  unique(measure_id,version_number)
);
create index world_domestic_measure_versions_scope_idx
  on public.world_domestic_measure_versions(measure_id,version_number desc);

create table public.world_domestic_measure_transitions (
  id uuid primary key default gen_random_uuid(),
  measure_id uuid not null,
  country_id uuid not null references public.countries(id) on delete restrict,
  revision bigint not null check (revision>0),
  prior_status text,
  next_status text not null,
  reason text check (reason is null or length(reason)<=500),
  operation_id uuid not null unique,
  changed_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  foreign key(measure_id,country_id)
    references public.world_domestic_measures(id,country_id) on delete restrict,
  unique(measure_id,revision)
);
create index world_domestic_measure_transitions_country_idx
  on public.world_domestic_measure_transitions(country_id,occurred_at desc);

-- Enacted law is an immutable historical text snapshot of the accepted version.
-- Repeal closes force of law without erasing the original version or enactment.
create table public.world_domestic_laws (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  measure_id uuid not null unique,
  title_snapshot text not null,
  body_snapshot text not null,
  version_number bigint not null check (version_number > 0),
  enactment_method text not null check (enactment_method in ('democratic','monarchical','decree')),
  enacted_at timestamptz not null default now(),
  status text not null default 'in_force' check (status in ('in_force','repealed')),
  repealed_at timestamptz,
  repeal_reason text check (repeal_reason is null or length(repeal_reason)<=500),
  revision bigint not null default 1 check (revision>0),
  foreign key(measure_id,country_id)
    references public.world_domestic_measures(id,country_id) on delete restrict,
  constraint world_domestic_law_repeal_order check (
    (status='in_force' and repealed_at is null)
    or (status='repealed' and repealed_at is not null and repealed_at>=enacted_at)
  )
);
create index world_domestic_laws_country_history_idx
  on public.world_domestic_laws(country_id,enacted_at desc,id);

alter table public.world_domestic_measures enable row level security;
alter table public.world_domestic_measure_versions enable row level security;
alter table public.world_domestic_measure_transitions enable row level security;
alter table public.world_domestic_laws enable row level security;
revoke all on public.world_domestic_measures,public.world_domestic_measure_versions,
  public.world_domestic_measure_transitions,public.world_domestic_laws
  from public,anon,authenticated,service_role;
grant select on public.world_domestic_measures,public.world_domestic_measure_versions,
  public.world_domestic_measure_transitions,public.world_domestic_laws
  to service_role;

create function public.world_write_domestic_measure_v1(
  p_country_id uuid,p_action text,p_measure_id uuid,
  p_payload jsonb,p_expected_revision bigint,
  p_operation_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $command$
declare
  v_actor uuid:=auth.uid();
  v_m public.world_domestic_measures%rowtype;
  v_claim jsonb;
  v_operation uuid;
  v_id uuid;
  v_revision bigint;
  v_next_status text;
  v_title text;
  v_body text;
  v_reason text;
  v_process text;
  v_version bigint;
  v_snapshot text;
  v_receipt jsonb;
begin
  if v_actor is null or p_country_id is null or not exists (
    select 1 from public.country_accounts ca
    where ca.country_id=p_country_id and ca.user_id=v_actor and ca.status='active'
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if not coalesce(public.studio2_feature_enabled('terra_world_public',null),false) then
    raise exception using errcode='42501',message='WORLD_NOT_PUBLISHED';
  end if;
  if p_action not in ('create','revise','advance','repeal')
     or p_payload is null or jsonb_typeof(p_payload)<>'object'
     or pg_column_size(p_payload)>20000
     or p_operation_id is null or p_expected_revision is null or p_expected_revision<0
     or length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  v_title:=nullif(btrim(p_payload ->> 'title'),'');
  v_body:=nullif(btrim(p_payload ->> 'body'),'');
  v_reason:=nullif(btrim(p_payload ->> 'reason'),'');
  v_process:=nullif(p_payload ->> 'processKind','');
  if length(coalesce(v_reason,''))>500 then
    raise exception using errcode='22023',message='REASON_TOO_LONG';
  end if;

  perform 1 from public.country_accounts ca
    where ca.country_id=p_country_id and ca.user_id=v_actor and ca.status='active'
    for update;
  if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.domestic.measure.'||p_action,'R2',
    jsonb_build_object('countryId',p_country_id,'subjectType','country'),
    jsonb_build_object('countryId',p_country_id,'action',p_action,
      'measureId',p_measure_id,'expectedRevision',p_expected_revision,'payload',p_payload)
  );
  v_operation:=(v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation)
      || jsonb_build_object('replayed',true);
  end if;

  if p_action='create' then
    if p_measure_id is not null or p_expected_revision<>0
       or v_title is null or length(v_title)>160
       or v_body is null or length(v_body)>15000
       or v_process not in ('democratic','monarchical','decree')
       or (select count(*) from public.world_domestic_measures
           where country_id=p_country_id)>=200 then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    insert into public.world_domestic_measures(country_id,title,process_kind)
      values(p_country_id,v_title,v_process)
      returning id,revision,current_version into v_id,v_revision,v_version;
    insert into public.world_domestic_measure_versions(
      measure_id,country_id,version_number,title_snapshot,body,operation_id,created_by
    ) values(v_id,p_country_id,v_version,v_title,v_body,v_operation,v_actor);
    insert into public.world_domestic_measure_transitions(
      measure_id,country_id,revision,prior_status,next_status,operation_id,changed_by
    ) values(v_id,p_country_id,v_revision,null,'draft',v_operation,v_actor);
  else
    if p_measure_id is null or p_expected_revision<1 then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    select * into v_m from public.world_domestic_measures
      where id=p_measure_id and country_id=p_country_id
      for update;
    if v_m.id is null or v_m.revision<>p_expected_revision then
      raise exception using errcode='40001',message='VERSION_CONFLICT';
    end if;
    v_id:=v_m.id;
    if p_action='revise' then
      if v_m.status not in ('draft','introduced','proposed')
         or v_title is null or length(v_title)>160
         or v_body is null or length(v_body)>15000
         or v_m.current_version>=20 then
        raise exception using errcode='23514',message='MEASURE_NOT_EDITABLE';
      end if;
      update public.world_domestic_measures
        set title=v_title,current_version=current_version+1,
            revision=revision+1,updated_at=now()
      where id=v_id returning revision,current_version into v_revision,v_version;
      insert into public.world_domestic_measure_versions(
        measure_id,country_id,version_number,title_snapshot,body,operation_id,created_by
      ) values(v_id,p_country_id,v_version,v_title,v_body,v_operation,v_actor);
    elsif p_action='advance' then
      v_next_status:=p_payload ->> 'nextStatus';
      if v_next_status is null or not (
        (v_m.process_kind='democratic' and (
          (v_m.status='draft' and v_next_status='introduced')
          or (v_m.status='introduced' and v_next_status in ('debated','rejected','withdrawn'))
          or (v_m.status='debated' and v_next_status in ('adopted','rejected','withdrawn'))
          or (v_m.status='adopted' and v_next_status='enacted')))
        or (v_m.process_kind='monarchical' and (
          (v_m.status='draft' and v_next_status='proposed')
          or (v_m.status='proposed' and v_next_status in ('council','vetoed','withdrawn'))
          or (v_m.status='council' and v_next_status in ('assented','vetoed'))
          or (v_m.status='assented' and v_next_status='enacted')))
        or (v_m.process_kind='decree' and (
          (v_m.status='draft' and v_next_status='issued')
          or (v_m.status='issued' and v_next_status='enacted')))
      ) then
        raise exception using errcode='23514',message='INVALID_DOMESTIC_PROCESS_TRANSITION';
      end if;
      update public.world_domestic_measures
        set status=v_next_status,visibility='public',
            public_version_floor=coalesce(public_version_floor,current_version),
            revision=revision+1,updated_at=now()
      where id=v_id returning revision,current_version into v_revision,v_version;
      insert into public.world_domestic_measure_transitions(
        measure_id,country_id,revision,prior_status,next_status,reason,
        operation_id,changed_by
      ) values(v_id,p_country_id,v_revision,v_m.status,v_next_status,
        v_reason,v_operation,v_actor);
      if v_next_status='enacted' then
        select body into v_snapshot from public.world_domestic_measure_versions
          where measure_id=v_id and version_number=v_version;
        if v_snapshot is null then
          raise exception using errcode='23514',message='MEASURE_TEXT_MISSING';
        end if;
        insert into public.world_domestic_laws(
          country_id,measure_id,title_snapshot,body_snapshot,version_number,enactment_method
        ) values(p_country_id,v_id,v_m.title,v_snapshot,v_version,v_m.process_kind);
      end if;
    else
      if v_m.status<>'enacted' then
        raise exception using errcode='23514',message='ONLY_ENACTED_LAWS_MAY_BE_REPEALED';
      end if;
      update public.world_domestic_laws
        set status='repealed',repealed_at=now(),repeal_reason=v_reason,
            revision=revision+1
      where country_id=p_country_id and measure_id=v_id and status='in_force';
      if not found then
        raise exception using errcode='40001',message='LAW_ALREADY_REPEALED';
      end if;
      update public.world_domestic_measures
        set revision=revision+1,updated_at=now()
      where id=v_id returning revision,current_version into v_revision,v_version;
      insert into public.world_domestic_measure_transitions(
        measure_id,country_id,revision,prior_status,next_status,reason,
        operation_id,changed_by
      ) values(v_id,p_country_id,v_revision,'enacted','repealed',v_reason,v_operation,v_actor);
    end if;
  end if;

  perform private.v3_emit_domain_event(
    case when p_action='repeal' then 'world.domestic_law.repealed'
      when v_next_status='enacted' then 'world.domestic_law.enacted'
      else 'world.domestic_measure.'||p_action end,
    'world_domestic_measure',v_id::text,v_revision,v_operation,null,null,
    jsonb_build_object('countryId',p_country_id,'id',v_id,
      'revision',v_revision,'action',p_action,'process',coalesce(v_m.process_kind,v_process)),
    1,array[]::text[]
  );
  v_receipt:=jsonb_build_object('ok',true,'id',v_id,'revision',v_revision,
    'countryId',p_country_id,'action',p_action,'operationId',v_operation);
  perform private.studio2_complete_operation(v_operation,v_receipt);
  return public.studio2_reconcile_operation(v_operation)
    || jsonb_build_object('replayed',false);
end
$command$;
revoke all on function public.world_write_domestic_measure_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.world_write_domestic_measure_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) to authenticated,service_role;

-- Public list stays small: never send 200 full 15k-text versions to browsers.
create function public.world_domestic_laws_v1(p_country_code text)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public
as $reader$
  select jsonb_build_object(
    'countryId',c.id,'countryCode',c.short_code,
    'isController',exists(select 1 from public.country_accounts ca
      where ca.country_id=c.id and ca.user_id=auth.uid() and ca.status='active'),
    'measures',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'title',m.title,'processKind',m.process_kind,
        'status',m.status,'published',m.visibility='public',
        'revision',m.revision,'currentVersion',m.current_version)
        order by m.updated_at desc,m.id)
      from (
        select m0.* from public.world_domestic_measures m0
        where m0.country_id=c.id and
          (m0.visibility='public' or exists(
            select 1 from public.country_accounts ca
            where ca.country_id=c.id and ca.user_id=auth.uid() and ca.status='active'))
        order by m0.updated_at desc,m0.id limit 30
      ) m
    ),'[]'::jsonb),
    'laws',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'measureId',l.measure_id,'title',l.title_snapshot,
        'status',l.status,'enactmentMethod',l.enactment_method,
        'enactedAt',l.enacted_at,'repealedAt',l.repealed_at)
        order by l.enacted_at desc,l.id)
      from (
        select l0.* from public.world_domestic_laws l0
        where l0.country_id=c.id
        order by l0.enacted_at desc,l0.id limit 30
      ) l
    ),'[]'::jsonb)
  ) from public.countries c
  where lower(c.short_code)=lower(btrim(p_country_code))
    and length(btrim(p_country_code)) between 2 and 12
    and coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
  limit 1
$reader$;
revoke all on function public.world_domestic_laws_v1(text)
  from public,anon,authenticated;
grant execute on function public.world_domestic_laws_v1(text)
  to anon,authenticated,service_role;

create function public.world_domestic_measure_detail_v1(p_measure_id uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public
as $reader$
  select jsonb_build_object(
    'id',m.id,'countryId',m.country_id,'title',m.title,
    'processKind',m.process_kind,'status',m.status,
    'published',m.visibility='public',
    'revision',m.revision,'currentVersion',m.current_version,
    'body',v.body,'versionHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'number',h.version_number,'createdAt',h.created_at,'title',h.title_snapshot)
        order by h.version_number desc)
      from public.world_domestic_measure_versions h
      where h.measure_id=m.id
        and (h.version_number>=m.public_version_floor or exists (
          select 1 from public.country_accounts ca
          where ca.country_id=m.country_id and ca.user_id=auth.uid()
            and ca.status='active'))
    ),'[]'::jsonb)
  ) from public.world_domestic_measures m
  join public.world_domestic_measure_versions v
    on v.measure_id=m.id and v.version_number=m.current_version
  where m.id=p_measure_id and
    coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
    and (m.visibility='public' or exists (
      select 1 from public.country_accounts ca where ca.user_id=auth.uid()
        and ca.country_id=m.country_id and ca.status='active'))
  limit 1
$reader$;
revoke all on function public.world_domestic_measure_detail_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_domestic_measure_detail_v1(uuid)
  to anon,authenticated,service_role;

-- TG17 derives published domestic law enactment/repeal without copying law text.
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
  if not coalesce(public.studio2_feature_enabled('terra_world_public',null),false) then
    raise exception using errcode='42501',message='WORLD_NOT_PUBLISHED';
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
        select ('law-enacted:'||l.id::text),l.enacted_at,
          l.title_snapshot || ' enacted',
          'A published domestic law entered force through the '
            || l.enactment_method || ' process.',
          'domestic_law','world_domestic_laws',c.short_code,null::text
        from public.world_domestic_laws l
        join public.countries c on c.id=l.country_id
        where l.enacted_at<=now()
          and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
        union all
        select ('law-repealed:'||l.id::text),l.repealed_at,
          l.title_snapshot || ' repealed',
          'A published domestic law ceased to be in force.',
          'domestic_law','world_domestic_laws',c.short_code,null::text
        from public.world_domestic_laws l
        join public.countries c on c.id=l.country_id
        where l.repealed_at is not null and l.repealed_at<=now()
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
      'v3.tg16.domestic-legislation',1,'forward_fix_only',false,null,
      'Optional fictional country-controlled democratic/monarchical/decree measure workflow, version snapshots and durable law enactment/repeal. No institutional authenticated ballots or competing TG7 legal authority.'
    );
  end if;
end
$contract$;
notify pgrst,'reload schema';
commit;

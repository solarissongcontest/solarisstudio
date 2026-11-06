begin;

-- WORLD-09 TG16 optional national legislature and configurable chambers.
-- This represents fictional lore, never a real authenticated membership/voting roll.
create table public.world_domestic_legislatures (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null unique references public.countries(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  description text check (description is null or length(description) <= 4000),
  election_cycle_months integer check (election_cycle_months between 1 and 240),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,country_id)
);

create table public.world_domestic_chambers (
  id uuid primary key default gen_random_uuid(),
  legislature_id uuid not null,
  country_id uuid not null references public.countries(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  seat_count integer check (seat_count between 0 and 100000),
  election_cycle_months integer check (election_cycle_months between 1 and 240),
  description text check (description is null or length(description) <= 4000),
  presiding_title text check (presiding_title is null or length(presiding_title) <= 120),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (legislature_id,country_id)
    references public.world_domestic_legislatures(id,country_id) on delete restrict
);
create index world_domestic_chambers_country_idx
  on public.world_domestic_chambers(country_id, title, id);

create table public.world_domestic_structure_revisions (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('legislature','chamber')),
  record_id uuid not null,
  country_id uuid not null references public.countries(id) on delete restrict,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null,
  operation_id uuid not null unique,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique(record_type,record_id,revision)
);

alter table public.world_domestic_legislatures enable row level security;
alter table public.world_domestic_chambers enable row level security;
alter table public.world_domestic_structure_revisions enable row level security;
revoke all on public.world_domestic_legislatures,
  public.world_domestic_chambers, public.world_domestic_structure_revisions
  from public,anon,authenticated;
revoke all on public.world_domestic_legislatures,
  public.world_domestic_chambers, public.world_domestic_structure_revisions from service_role;
grant select on public.world_domestic_legislatures,
  public.world_domestic_chambers, public.world_domestic_structure_revisions to service_role;

create function public.world_write_domestic_structure_v1(
  p_country_id uuid, p_kind text, p_subject_id uuid,
  p_payload jsonb, p_expected_revision bigint,
  p_operation_id uuid, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog,public,private
as $command$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation uuid;
  v_record uuid;
  v_revision bigint;
  v_legislature uuid;
  v_title text;
  v_description text;
  v_visible boolean;
  v_cycle integer;
  v_seats integer;
  v_presiding text;
  v_receipt jsonb;
begin
  if v_actor is null or p_country_id is null
    or not exists (
      select 1 from public.country_accounts ca where
        ca.country_id=p_country_id and ca.user_id=v_actor and ca.status='active'
    ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if not coalesce(public.studio2_feature_enabled('terra_world_public',null),false) then
    raise exception using errcode='42501',message='WORLD_NOT_PUBLISHED';
  end if;
  if p_kind not in ('legislature','chamber')
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384
    or p_operation_id is null
    or length(coalesce(p_idempotency_key,'')) not between 8 and 200
    or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  v_title := nullif(btrim(coalesce(p_payload ->> 'title','')),'');
  v_description := nullif(btrim(p_payload ->> 'description'),'');
  v_presiding := nullif(btrim(p_payload ->> 'presidingTitle'),'');
  if v_title is null or length(v_title) > 160
    or length(coalesce(v_description,'')) > 4000
    or length(coalesce(v_presiding,'')) > 120
    or coalesce(p_payload ->> 'published','false') not in ('true','false') then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  v_visible := coalesce((p_payload ->> 'published')::boolean,false);
  v_cycle := nullif(p_payload ->> 'electionCycleMonths','')::integer;
  v_seats := nullif(p_payload ->> 'seatCount','')::integer;
  if (v_cycle is not null and (v_cycle < 1 or v_cycle > 240))
    or (v_seats is not null and (v_seats < 0 or v_seats > 100000)) then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  -- Strict per-country mutual exclusion for edits and capacity invariants.
  perform 1 from public.country_accounts ca where ca.country_id=p_country_id
    and ca.user_id=v_actor and ca.status='active' for update;
  if not found then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'world.domestic.' || p_kind || '.write','R2',
    jsonb_build_object('countryId',p_country_id,'subjectType','country'),
    jsonb_build_object('countryId',p_country_id,'kind',p_kind,
      'subjectId',p_subject_id,'expectedRevision',p_expected_revision,'payload',p_payload)
  );
  v_operation := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation)
      || jsonb_build_object('replayed',true);
  end if;

  if p_kind='legislature' then
    if p_subject_id is null then
      if p_expected_revision <> 0 then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
      insert into public.world_domestic_legislatures(
        country_id,name,description,election_cycle_months,visibility
      ) values (
        p_country_id,v_title,v_description,v_cycle,
        case when v_visible then 'public' else 'draft' end
      ) returning id,revision into v_record,v_revision;
    else
      if not v_visible and exists (
        select 1 from public.world_domestic_chambers ch
        where ch.legislature_id=p_subject_id and ch.country_id=p_country_id
          and ch.visibility='public'
      ) then
        raise exception using errcode='23514',message='PUBLIC_CHAMBERS_DEPEND_ON_LEGISLATURE';
      end if;
      update public.world_domestic_legislatures set
        name=v_title,description=v_description,election_cycle_months=v_cycle,
        visibility=case when v_visible then 'public' else 'draft' end,
        revision=revision+1,updated_at=now()
      where id=p_subject_id and country_id=p_country_id
        and revision=p_expected_revision
      returning id,revision into v_record,v_revision;
      if v_record is null then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
    end if;
  else
    if nullif(p_payload ->> 'legislatureId','') is null then
      raise exception using errcode='22023',message='VALIDATION';
    end if;
    v_legislature := (p_payload ->> 'legislatureId')::uuid;
    if not exists (
      select 1 from public.world_domestic_legislatures l
      where l.id=v_legislature and l.country_id=p_country_id
        and (not v_visible or l.visibility='public')
    ) then
      raise exception using errcode='23503',message='LEGISLATURE_NOT_PUBLISHED';
    end if;
    if p_subject_id is null then
      if p_expected_revision <> 0 then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
      if (select count(*) from public.world_domestic_chambers ch
          where ch.country_id=p_country_id) >= 10 then
        raise exception using errcode='22023',message='CHAMBER_LIMIT';
      end if;
      insert into public.world_domestic_chambers(
        legislature_id,country_id,title,seat_count,election_cycle_months,
        description,presiding_title,visibility
      ) values (
        v_legislature,p_country_id,v_title,v_seats,v_cycle,v_description,
        v_presiding,case when v_visible then 'public' else 'draft' end
      ) returning id,revision into v_record,v_revision;
    else
      update public.world_domestic_chambers set
        title=v_title,seat_count=v_seats,election_cycle_months=v_cycle,
        description=v_description,presiding_title=v_presiding,
        visibility=case when v_visible then 'public' else 'draft' end,
        revision=revision+1,updated_at=now()
      where id=p_subject_id and country_id=p_country_id
        and legislature_id=v_legislature and revision=p_expected_revision
      returning id,revision into v_record,v_revision;
      if v_record is null then
        raise exception using errcode='40001',message='VERSION_CONFLICT';
      end if;
    end if;
  end if;

  insert into public.world_domestic_structure_revisions(
    record_type,record_id,country_id,revision,snapshot,operation_id,changed_by
  ) values (
    p_kind,v_record,p_country_id,v_revision,
    case p_kind when 'legislature' then
      (select to_jsonb(l) from public.world_domestic_legislatures l where l.id=v_record)
    else (select to_jsonb(ch) from public.world_domestic_chambers ch where ch.id=v_record)
    end,v_operation,v_actor
  );
  perform private.v3_emit_domain_event(
    'world.domestic_' || p_kind || '.changed',
    'world_domestic_' || p_kind,v_record::text,v_revision,v_operation,null,null,
    jsonb_build_object('countryId',p_country_id,'id',v_record,
      'revision',v_revision,'public',v_visible),1,array[]::text[]
  );
  v_receipt := jsonb_build_object('ok',true,'kind',p_kind,'countryId',p_country_id,
    'id',v_record,'revision',v_revision,'operationId',v_operation);
  perform private.studio2_complete_operation(v_operation,v_receipt);
  return public.studio2_reconcile_operation(v_operation)
    || jsonb_build_object('replayed',false);
end
$command$;
revoke all on function public.world_write_domestic_structure_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.world_write_domestic_structure_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) to authenticated,service_role;

-- Read only the public structure, or drafts for the canonical current controller.
-- A draft legislature may not expose a public chamber through separate read.
create function public.world_domestic_legislature_v1(p_country_code text)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public
as $reader$
  select jsonb_build_object(
    'countryId',c.id,'countryCode',c.short_code,
    'isController',exists(select 1 from public.country_accounts ca
      where ca.country_id=c.id and ca.user_id=auth.uid() and ca.status='active'),
    'legislature',case
      when l.id is null then null
      else jsonb_build_object(
        'id',l.id,'name',l.name,'description',l.description,
        'electionCycleMonths',l.election_cycle_months,
        'published',l.visibility='public','revision',l.revision
      ) end,
    'chambers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ch.id,'title',ch.title,'seatCount',ch.seat_count,
        'electionCycleMonths',ch.election_cycle_months,
        'presidingTitle',ch.presiding_title,'description',ch.description,
        'published',ch.visibility='public','revision',ch.revision)
        order by ch.title,ch.id)
      from public.world_domestic_chambers ch
      where ch.legislature_id=l.id
        and (ch.visibility='public' or exists (
          select 1 from public.country_accounts ca where ca.user_id=auth.uid()
          and ca.country_id=c.id and ca.status='active'))
      limit 10
    ),'[]'::jsonb)
  )
  from public.countries c
  left join public.world_domestic_legislatures l
    on l.country_id=c.id and
      (l.visibility='public' or exists (
        select 1 from public.country_accounts ca
        where ca.country_id=c.id and ca.user_id=auth.uid() and ca.status='active'))
  where lower(c.short_code)=lower(btrim(p_country_code))
    and length(btrim(p_country_code)) between 2 and 12
    and coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
  limit 1
$reader$;
revoke all on function public.world_domestic_legislature_v1(text)
  from public,anon,authenticated;
grant execute on function public.world_domestic_legislature_v1(text)
  to anon,authenticated,service_role;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg16.domestic-legislature-chambers',1,'forward_fix_only',
      false,null,
      'Add optional configurable national legislature and chamber summaries; country controller governed mutations, revision snapshots and public-only read projection. No real voting authority or alternate country-government profile.'
    );
  end if;
end
$contract$;
notify pgrst,'reload schema';
commit;

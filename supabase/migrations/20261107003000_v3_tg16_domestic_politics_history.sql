begin;

-- TG16/TG17. Domestic canon is optional and country-controlled.
-- These are NOT competing current-government/country-account authorities.
-- country_profiles remains the source for the current government summary.
create table public.world_domestic_parties (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  abbreviation text check (abbreviation is null or length(abbreviation) <= 30),
  ideology text check (ideology is null or length(ideology) <= 160),
  summary text check (summary is null or length(summary) <= 4000),
  status text not null default 'active' check (status in ('active','dissolved')),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, country_id)
);
create index world_domestic_parties_country_idx
  on public.world_domestic_parties (country_id, name, id);

-- A domestic election is an authored, fictional historic fact.
-- It is NEVER an authenticated institutional ballot or tally.
create table public.world_domestic_elections (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  scope text not null default 'general'
    check (scope in ('general','presidential','legislative','regional','local','other')),
  held_on date not null,
  turnout_percent numeric(5,2) check (turnout_percent between 0 and 100),
  winner_party_id uuid,
  result_summary text not null check (length(btrim(result_summary)) between 1 and 4000),
  visibility text not null default 'draft' check (visibility in ('draft','public')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (winner_party_id, country_id)
    references public.world_domestic_parties(id, country_id) on delete restrict
);
create index world_domestic_elections_chronology_idx
  on public.world_domestic_elections(country_id, held_on desc, id);

-- Only author-authenticated editorial history is stored here.
-- Institutional and domestic formal facts are DERIVED in the timeline RPC;
-- do not copy official events into this mutable table.
create table public.world_history_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'editorial' check (event_type = 'editorial'),
  occurred_at timestamptz not null,
  edition_id uuid references public.editions(id) on delete set null,
  country_id uuid not null references public.countries(id) on delete restrict,
  country_ids uuid[] not null,
  organization_ids uuid[] not null default array[]::uuid[],
  title text not null check (length(btrim(title)) between 1 and 160),
  summary text not null check (length(btrim(summary)) between 1 and 4000),
  source_type text not null default 'editorial' check (source_type = 'editorial'),
  source_id uuid,
  provenance jsonb not null default '{}'::jsonb,
  visibility text not null default 'public' check (visibility in ('draft','public')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  check (cardinality(country_ids) = 1 and country_ids[1] = country_id),
  check (cardinality(organization_ids) = 0),
  check (source_id is null)
);
create index world_history_events_published_idx
  on public.world_history_events(occurred_at desc, id)
  where visibility = 'public';
create index world_history_events_country_idx
  on public.world_history_events(country_id, occurred_at desc);

-- No browser-side writes, even for a controller; consequential mutations use
-- the governed command below with CAS, operation receipts and domain events.
alter table public.world_domestic_parties enable row level security;
alter table public.world_domestic_elections enable row level security;
alter table public.world_history_events enable row level security;
revoke all on public.world_domestic_parties from public, anon, authenticated;
revoke all on public.world_domestic_elections from public, anon, authenticated;
revoke all on public.world_history_events from public, anon, authenticated;
grant all on public.world_domestic_parties, public.world_domestic_elections,
  public.world_history_events to service_role;

-- The only authorised user mutation boundary for TG16/TG17.
create function public.world_write_domestic_canon_v1(
  p_country_id uuid, p_kind text, p_subject_id uuid,
  p_payload jsonb, p_expected_revision bigint,
  p_operation_id uuid, p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $command$
declare
  v_actor uuid := auth.uid();
  v_operation uuid;
  v_claim jsonb;
  v_id uuid;
  v_revision bigint;
  v_record jsonb;
  v_published boolean;
  v_title text;
  v_summary text;
  v_winner uuid;
  v_held date;
  v_when timestamptz;
begin
  if v_actor is null or p_country_id is null or
     not exists (
       select 1 from public.country_accounts ca
       where ca.country_id = p_country_id
         and ca.user_id = v_actor and ca.status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_kind not in ('party','election','editorial_history')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_operation_id is null
     or length(coalesce(p_idempotency_key,'')) not between 8 and 200
     or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if coalesce(p_payload ->> 'published','false') not in ('true','false') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  v_published := coalesce((p_payload ->> 'published')::boolean, false);
  v_title := nullif(btrim(coalesce(p_payload ->> 'title',p_payload ->> 'name','')), '');
  v_summary := nullif(btrim(coalesce(p_payload ->> 'summary',
                  p_payload ->> 'resultSummary','')), '');
  if v_title is null or length(v_title) > 160 or
     length(coalesce(v_summary,'')) > 4000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_kind <> 'party' and v_summary is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Concurrency serialises per country even when creating independent rows.
  perform 1 from public.country_accounts
   where country_id = p_country_id and user_id = v_actor and status = 'active'
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'world.domestic.' || p_kind || '.write', 'R2',
    jsonb_build_object('countryId',p_country_id,'subjectType','country'),
    jsonb_build_object('countryId',p_country_id,'subjectId',p_subject_id,
      'kind',p_kind,'expectedRevision',p_expected_revision,'payload',p_payload)
  );
  v_operation := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation)
           || jsonb_build_object('replayed',true);
  end if;

  if p_kind = 'party' then
    if length(v_title) > 120
       or length(coalesce(p_payload ->> 'abbreviation','')) > 30
       or length(coalesce(p_payload ->> 'ideology','')) > 160
       or coalesce(p_payload ->> 'status','active') not in ('active','dissolved') then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if p_subject_id is null then
      if p_expected_revision <> 0 then
        raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
      end if;
      insert into public.world_domestic_parties(
        country_id,name,abbreviation,ideology,summary,status,visibility
      ) values (
        p_country_id,v_title,nullif(btrim(p_payload ->> 'abbreviation'),''),
        nullif(btrim(p_payload ->> 'ideology','')),
        v_summary,coalesce(p_payload ->> 'status','active'),
        case when v_published then 'public' else 'draft' end
      ) returning id,revision into v_id,v_revision;
    else
      update public.world_domestic_parties
         set name=v_title,
             abbreviation=nullif(btrim(p_payload ->> 'abbreviation'),''),
             ideology=nullif(btrim(p_payload ->> 'ideology'),''),
             summary=v_summary,
             status=coalesce(p_payload ->> 'status','active'),
             visibility=case when v_published then 'public' else 'draft' end,
             revision=revision+1,updated_at=now()
       where id=p_subject_id and country_id=p_country_id
         and revision=p_expected_revision
       returning id,revision into v_id,v_revision;
      if v_id is null then
        raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
      end if;
    end if;
  elsif p_kind = 'election' then
    if p_subject_id is not null or p_expected_revision <> 0 then
      -- Official history is append-only. Corrections are separate records.
      raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
    end if;
    if coalesce(p_payload ->> 'scope','general') not in
       ('general','presidential','legislative','regional','local','other')
       or nullif(p_payload ->> 'heldOn','') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_held := (p_payload ->> 'heldOn')::date;
    if v_held > current_date then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if nullif(p_payload ->> 'winnerPartyId','') is not null then
      v_winner := (p_payload ->> 'winnerPartyId')::uuid;
      if not exists (
        select 1 from public.world_domestic_parties
         where id=v_winner and country_id=p_country_id
      ) then
        raise exception using errcode = '23503', message = 'VALIDATION';
      end if;
    end if;
    insert into public.world_domestic_elections(
      country_id,title,scope,held_on,turnout_percent,winner_party_id,
      result_summary,visibility
    ) values (
      p_country_id,v_title,coalesce(p_payload ->> 'scope','general'),v_held,
      nullif(p_payload ->> 'turnoutPercent','')::numeric,v_winner,v_summary,
      case when v_published then 'public' else 'draft' end
    ) returning id,revision into v_id,v_revision;
  else
    if p_subject_id is not null or p_expected_revision <> 0
       or not v_published or nullif(p_payload ->> 'occurredAt','') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_when := (p_payload ->> 'occurredAt')::timestamptz;
    if v_when > now() then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    insert into public.world_history_events(
      country_id,country_ids,title,summary,occurred_at,created_by,
      source_type,event_type,visibility,provenance
    ) values (
      p_country_id,array[p_country_id],v_title,v_summary,v_when,v_actor,
      'editorial','editorial','public',
      jsonb_build_object('recordedVia','world_write_domestic_canon_v1',
                         'operationId',v_operation)
    ) returning id,revision into v_id,v_revision;
  end if;

  perform private.v3_emit_domain_event(
    case p_kind
      when 'party' then 'world.domestic_party.changed'
      when 'election' then 'world.domestic_election.recorded'
      else 'world.history.editorial_published' end,
    'world_' || p_kind, v_id::text, v_revision, v_operation,
    null,null,
    jsonb_build_object('countryId',p_country_id,'id',v_id,
      'revision',v_revision,'public',v_published),
    1,array[]::text[]
  );
  v_record := jsonb_build_object('ok',true,'kind',p_kind,'id',v_id,
    'countryId',p_country_id,'revision',v_revision,'operationId',v_operation);
  perform private.studio2_complete_operation(v_operation, v_record);
  return public.studio2_reconcile_operation(v_operation)
         || jsonb_build_object('replayed',false);
end
$command$;
revoke all on function public.world_write_domestic_canon_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.world_write_domestic_canon_v1(
  uuid,text,uuid,jsonb,bigint,uuid,text) to authenticated,service_role;

-- Single country projection. Controller drafts may appear only to their
-- authenticated controller; public records require visibility='public'.
create function public.world_domestic_country_v1(p_country_code text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $reader$
 select jsonb_build_object(
   'countryId',c.id,'countryCode',c.short_code,'countryName',c.name,
   'governmentType',pr.government_type,'leaderName',pr.leader_name,
   'leaderTitle',pr.leader_title,
   'isController',exists(
     select 1 from public.country_accounts a
     where a.country_id=c.id and a.user_id=auth.uid() and a.status='active'),
   'parties',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',p.id,'name',p.name,'abbreviation',p.abbreviation,
       'ideology',p.ideology,'summary',p.summary,'status',p.status,
       'published',p.visibility='public','revision',p.revision)
       order by p.name,p.id)
     from public.world_domestic_parties p where p.country_id=c.id
       and (p.visibility='public' or exists(
         select 1 from public.country_accounts ca
         where ca.user_id=auth.uid() and ca.country_id=c.id
           and ca.status='active'))
   ),'[]'::jsonb),
   'elections',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',e.id,'title',e.title,'scope',e.scope,'heldOn',e.held_on,
       'turnoutPercent',e.turnout_percent,'resultSummary',e.result_summary,
       'winnerPartyId',e.winner_party_id,'published',e.visibility='public')
       order by e.held_on desc,e.id)
     from public.world_domestic_elections e where e.country_id=c.id
       and (e.visibility='public' or exists(
         select 1 from public.country_accounts ca
         where ca.user_id=auth.uid() and ca.country_id=c.id
           and ca.status='active'))
   ),'[]'::jsonb)
 )
 from public.countries c
 left join public.country_profiles pr on pr.country_id=c.id
 where lower(c.short_code)=lower(btrim(p_country_code))
   and length(btrim(p_country_code)) between 2 and 12
 limit 1
$reader$;
revoke all on function public.world_domestic_country_v1(text)
  from public,anon,authenticated;
grant execute on function public.world_domestic_country_v1(text)
  to anon,authenticated,service_role;

-- Derived TG17 global Archive: only public events.
-- No one can edit an institutional event by changing editorial history.
-- All returned provenance makes editorial vs canonical derivation explicit.
create function public.world_history_timeline_v1(
  p_page integer default 0, p_country_code text default null
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $history$
declare v_rows jsonb;
begin
  if p_page is null or p_page < 0 or p_page > 100
     or (p_country_code is not null and (
       length(btrim(p_country_code)) not between 2 and 12
       or p_country_code !~ '^[[:alnum:]-]+$')) then
    raise exception using errcode='22023',message='VALIDATION';
  end if;
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.occurred_at desc,
                             page_row.id desc),'[]'::jsonb)
  into v_rows
  from (
    select * from (
      select ('editorial:'||h.id::text) id, h.occurred_at,
        h.title,h.summary,'editorial'::text source_type,
        'world_history_events'::text provenance,
        c.short_code country_code,null::text organization_slug
      from public.world_history_events h
      join public.countries c on c.id=h.country_id
      where h.visibility='public'
        and h.occurred_at<=now()
        and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
      union all
      select ('election:'||e.id::text), e.held_on::timestamptz,
        e.title,e.result_summary,'domestic_election',
        'world_domestic_elections',c.short_code,null::text
      from public.world_domestic_elections e
      join public.countries c on c.id=e.country_id
      where e.visibility='public' and e.held_on<=current_date
        and (p_country_code is null or lower(c.short_code)=lower(p_country_code))
      union all
      select ('organization:'||o.id::text),o.recognized_at,
        o.official_name || ' recognized',
        coalesce(o.description,'Official institution of Terra Solaris.'),
        'institutional','world_organizations',
        null::text,o.slug
      from public.world_organizations o
      where p_country_code is null and o.public_visibility='public'
        and o.status in ('recognized','active','suspended','historical','dissolved')
        and o.recognized_at is not null and o.recognized_at<=now()
    ) source_records
    order by occurred_at desc,id desc
    limit 20 offset p_page*20
  ) page_row;
  return jsonb_build_object('events',v_rows,'page',p_page,
    'pageSize',20,'hasMore',jsonb_array_length(v_rows)=20);
end
$history$;
revoke all on function public.world_history_timeline_v1(integer,text)
  from public,anon,authenticated;
grant execute on function public.world_history_timeline_v1(integer,text)
  to anon,authenticated,service_role;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg16-tg17.domestic-and-derived-world-history',1,'forward_fix_only',
     false,null,
     'Optional controller-owned domestic parties and fictional elections; immutable editorial world events; published-only derived archive from canonical sources. No competing current government, real ballot, country controller or notification authority.'
   );
 end if;
end
$contract$;
notify pgrst,'reload schema';
commit;

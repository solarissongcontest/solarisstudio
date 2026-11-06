begin;

-- TG4 treaty metadata is keyed to the existing canonical legal Work. This
-- metadata NEVER publishes or supersedes document versions and NEVER turns
-- an invited country into a signer or ratifier.
create table public.world_treaties (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.world_documents(id) on delete restrict,
  treaty_type text not null,
  opened_at timestamptz,
  effective_at timestamptz,
  terminated_at timestamptz,
  status text not null default 'registered',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_treaties_type_check check (
    treaty_type in ('bilateral','multilateral','founding','accession','protocol','other')
  ),
  constraint world_treaties_status_check check (
    status in ('registered','open','signed','ratified','effective','terminated','historical')
  ),
  constraint world_treaties_chronology_check check (
    (effective_at is null or opened_at is null or effective_at >= opened_at)
    and (terminated_at is null or (effective_at is not null and terminated_at >= effective_at))
  ),
  constraint world_treaties_revision_check check (revision >= 1)
);
create index world_treaties_status_idx on public.world_treaties(status, created_at desc);

create table public.world_treaty_parties (
  id uuid primary key default gen_random_uuid(),
  treaty_id uuid not null references public.world_treaties(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  role text not null default 'invited',
  signed_at timestamptz,
  ratified_at timestamptz,
  withdrew_at timestamptz,
  status text not null default 'invited',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  unique (treaty_id,country_id),
  constraint world_treaty_parties_role_check check (
    role in ('invited','founder','accession','observer')
  ),
  constraint world_treaty_parties_status_check check (
    status in ('invited','signed','ratified','withdrawn')
  ),
  constraint world_treaty_parties_state_check check (
    (status='invited' and signed_at is null and ratified_at is null and withdrew_at is null)
    or (status='signed' and signed_at is not null and ratified_at is null and withdrew_at is null)
    or (status='ratified' and signed_at is not null and ratified_at is not null and withdrew_at is null)
    or (status='withdrawn' and withdrew_at is not null)
  ),
  constraint world_treaty_parties_time_check check (
    (ratified_at is null or (signed_at is not null and ratified_at >= signed_at))
    and (withdrew_at is null or (signed_at is not null and withdrew_at >= signed_at))
  ),
  constraint world_treaty_parties_revision_check check (revision >= 1)
);
create index world_treaty_parties_country_idx
  on public.world_treaty_parties(country_id,treaty_id);

-- Prevent browser-authenticated writes to legal and treaty status. Read access
-- is exposed only through the narrow, publication-safe RPC below.
alter table public.world_treaties enable row level security;
alter table public.world_treaty_parties enable row level security;
revoke all on public.world_treaties from public, anon, authenticated;
revoke all on public.world_treaty_parties from public, anon, authenticated;
revoke all on public.world_treaties from service_role;
revoke all on public.world_treaty_parties from service_role;

create or replace function public.world_register_treaty_v1(
  p_document_id uuid,
  p_treaty_type text,
  p_opened_at timestamptz,
  p_country_ids uuid[],
  p_expected_document_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $register$
declare
  v_document public.world_documents%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_treaty_id uuid;
  v_new_document_revision bigint;
  v_result jsonb;
  v_requested_count integer;
begin
  if p_document_id is null or p_expected_document_revision is null
     or p_expected_document_revision < 1 or p_treaty_type is null
     or p_treaty_type not in ('bilateral','multilateral','founding','accession','protocol','other')
     or p_country_ids is null or array_position(p_country_ids,null) is not null
     or cardinality(p_country_ids) < 1 or cardinality(p_country_ids) > 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  select count(distinct country_id) into v_requested_count
  from unnest(p_country_ids) as requested(country_id);
  if v_requested_count <> cardinality(p_country_ids) then
    raise exception using errcode = '22023', message = 'DUPLICATE_PARTY';
  end if;

  select * into v_document from public.world_documents
  where id = p_document_id;
  if v_document.id is null or v_document.document_type <> 'treaty'
     or not public.world_access_allowed(
       'world.document.manage',v_document.organization_id,null,null,
       'document',p_document_id
     )
     or private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, coalesce(p_correlation_id,p_operation_id),
    'world.treaty.register','R2',
    jsonb_build_object('organizationId',v_document.organization_id,
      'documentId',p_document_id,'subjectType','world_document'),
    jsonb_build_object('documentId',p_document_id,
      'treatyType',p_treaty_type,'openedAt',p_opened_at,
      'countryIds',(select jsonb_agg(country_id order by country_id)
        from unnest(p_country_ids) as requested(country_id)),
      'expectedDocumentRevision',p_expected_document_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;
  perform private.studio2_require_fresh_auth(300);

  select * into v_document
  from public.world_documents where id = p_document_id for update;
  if v_document.id is null or v_document.document_type <> 'treaty'
     or v_document.status <> 'active'
     or not public.world_access_allowed(
       'world.document.manage',v_document.organization_id,null,null,
       'document',p_document_id
     )
     or private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_document.revision is distinct from p_expected_document_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if exists (select 1 from public.world_treaties
     where document_id = p_document_id) then
    raise exception using errcode = '23505', message = 'TREATY_ALREADY_REGISTERED';
  end if;
  if (select count(*) from public.countries where id = any(p_country_ids))
       <> cardinality(p_country_ids) then
    raise exception using errcode = '23503', message = 'UNKNOWN_TREATY_COUNTRY';
  end if;
  insert into public.world_treaties(document_id,treaty_type,opened_at,status)
  values (p_document_id,p_treaty_type,p_opened_at,'registered')
  returning id into v_treaty_id;

  -- Registration records countries merely invited/listed by the proposal.
  -- It intentionally does not assert consent, signature or ratification.
  insert into public.world_treaty_parties(treaty_id,country_id,role,status)
  select v_treaty_id, country_id, 'invited', 'invited'
  from unnest(p_country_ids) as requested(country_id);

  v_new_document_revision := v_document.revision+1;
  update public.world_documents
  set revision=v_new_document_revision,updated_at=now()
  where id=p_document_id;

  perform private.v3_emit_domain_event(
    'world.treaty.registered','world_treaty',v_treaty_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('organizationId',v_document.organization_id,
      'documentId',p_document_id,'treatyId',v_treaty_id,
      'listedCountryCount',cardinality(p_country_ids)),
    1,array['world.documents.projection']::text[]
  );
  v_result := jsonb_build_object('ok',true,'operationId',v_operation_id,
    'documentId',p_document_id,'treatyId',v_treaty_id,
    'documentRevision',v_new_document_revision,
    'listedCountryCount',cardinality(p_country_ids));
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$register$;
revoke all on function public.world_register_treaty_v1(
  uuid,text,timestamptz,uuid[],bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_register_treaty_v1(
  uuid,text,timestamptz,uuid[],bigint,uuid,text,uuid
) to authenticated;

-- Live, bounded, publication-gated projection. No draft document, members
-- text, organization-private identity, or invited party contact information
-- can leak through anonymous/public discovery.
create or replace function public.world_get_published_treaties_v1(
  p_organization_slug text default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $public_treaties$
  with published as (
    select t.id,t.document_id,t.treaty_type,t.opened_at,t.effective_at,
      t.terminated_at,t.status,doc.slug,doc.title,
      org.slug as organization_slug,org.official_name as organization_name,
      ver.version_number,ver.content_hash,ver.effective_from
    from public.world_treaties t
    join public.world_documents doc on doc.id=t.document_id
    join public.world_organizations org on org.id=doc.organization_id
    join public.world_document_versions ver on ver.id=doc.current_version_id
    where doc.document_type='treaty' and doc.visibility='public'
      -- SQL projection is called directly by anonymous clients. It must use
      -- the same feature-flag/recognition/public-Version gate as raw TG4 RLS.
      and public.world_document_publicly_available_v1(doc.id)
      and org.public_visibility='public'
      and org.status in ('recognized','active','historical')
      and doc.status in ('active','historical')
      and ver.publication_state='published'
      and (p_organization_slug is null or org.slug=p_organization_slug)
    order by t.created_at desc,t.id
    limit greatest(1,least(coalesce(p_limit,50),100))
  )
  select jsonb_build_object('treaties',coalesce(jsonb_agg(
    jsonb_build_object(
      'treatyId',p.id,'documentId',p.document_id,
      'organizationSlug',p.organization_slug,
      'organizationName',p.organization_name,
      'documentSlug',p.slug,'title',p.title,'treatyType',p.treaty_type,
      'status',p.status,'openedAt',p.opened_at,'effectiveAt',p.effective_at,
      'terminatedAt',p.terminated_at,'versionNumber',p.version_number,
      'contentHash',p.content_hash,'documentEffectiveFrom',p.effective_from,
      'parties',(
        select coalesce(jsonb_agg(
          jsonb_build_object('countryId',party.country_id,
            'countryName',country.name,'countryCode',country.short_code,
            'role',party.role,'status',party.status,
            'signedAt',party.signed_at,'ratifiedAt',party.ratified_at,
            'withdrewAt',party.withdrew_at)
          order by country.name,party.country_id),'[]'::jsonb)
        from public.world_treaty_parties party
        join public.countries country on country.id=party.country_id
        where party.treaty_id=p.id
      )
    ) order by p.opened_at desc nulls last,p.id),'[]'::jsonb))
  from published p;
$public_treaties$;
revoke all on function public.world_get_published_treaties_v1(text,integer)
 from public,anon,authenticated;
grant execute on function public.world_get_published_treaties_v1(text,integer)
 to anon,authenticated;

-- Private manager projection for exact treaty registration/duplicate detection.
create or replace function public.world_get_treaty_manager_v1(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $manager_treaty$
declare
  v_document public.world_documents%rowtype;
  v_treaty public.world_treaties%rowtype;
begin
  select * into v_document from public.world_documents
  where id=p_document_id and document_type='treaty';
  if v_document.id is null or not public.world_access_allowed(
    'world.document.manage',v_document.organization_id,null,null,
    'document',v_document.id
  ) then
    return null;
  end if;
  select * into v_treaty from public.world_treaties
  where document_id=p_document_id;
  if v_treaty.id is null then
    return jsonb_build_object('registered',false,'documentId',p_document_id);
  end if;
  return jsonb_build_object('registered',true,'documentId',p_document_id,
    'treatyId',v_treaty.id,'revision',v_treaty.revision,
    'status',v_treaty.status,'treatyType',v_treaty.treaty_type,
    'openedAt',v_treaty.opened_at,
    'countries',(
      select coalesce(jsonb_agg(party.country_id order by party.country_id),'[]'::jsonb)
      from public.world_treaty_parties party where party.treaty_id=v_treaty.id
    ));
end
$manager_treaty$;
revoke all on function public.world_get_treaty_manager_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.world_get_treaty_manager_v1(uuid)
 to authenticated;

comment on function public.world_get_published_treaties_v1(text,integer) is
  'TG4 publication-safe registered treaty directory. A listed/invited party is NOT a signature or ratification.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-treaty-register',
      1,'forward_fix_only',false,null,
      'Create generic treaty metadata linked to legal Works, invitation-only parties, governed registration and bounded publication-safe directory.'
    );
  end if;
end
$contract$;
notify pgrst,'reload schema';
commit;

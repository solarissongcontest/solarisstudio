begin;

-- TG9 official institutional publication. TG2 owns organization and office
-- authority, R2 owns receipts and DomainEvents. This migration creates no
-- second institutional identity, document store or notification engine.
insert into public.studio2_capabilities(key,domain,label,description,access_level)
values ('world.statement.publish','world','Publish official statements',
  'Publish and correct official organization or officeholder statements in institutional scope.','approve')
on conflict (key) do nothing;

-- Canonical office grants. No role-name check exists in the write commands.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id,'world.statement.publish'
from public.world_organization_offices office_row
join public.world_organizations org on org.id=office_row.organization_id
where (org.slug,office_row.slug) in (
  ('guard','chairperson'),('guard','deputy-chairperson'),
  ('unity','secretary-general'),('unity','deputy-secretary-general')
)
on conflict do nothing;

create table public.world_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  statement_type text not null,
  issuing_office_id uuid references public.world_organization_offices(id) on delete restrict,
  issuing_person_id uuid references public.delegation_people(id) on delete restrict,
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_version_id uuid,
  visibility text not null default 'public',
  revision bigint not null default 1,
  constraint world_statements_type_chk check(statement_type in ('organization','officeholder')),
  constraint world_statements_issuer_chk check(
    (statement_type='organization' and issuing_office_id is null and issuing_person_id is null)
    or (statement_type='officeholder' and issuing_office_id is not null and issuing_person_id is not null)
  ),
  constraint world_statements_title_chk check(length(btrim(title)) between 1 and 180),
  constraint world_statements_body_chk check(length(btrim(body)) between 1 and 30000),
  constraint world_statements_visibility_chk check(visibility in ('public','members','private')),
  constraint world_statements_revision_chk check(revision >= 1)
);

create table public.world_statement_versions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.world_statements(id) on delete restrict,
  version_number integer not null,
  title text not null,
  body text not null,
  correction_reason text,
  published_at timestamptz not null default now(),
  published_by_user_id uuid references auth.users(id) on delete set null,
  unique(statement_id,version_number),
  unique(id,statement_id),
  constraint world_statement_version_number_chk check(version_number >= 1),
  constraint world_statement_version_title_chk check(length(btrim(title)) between 1 and 180),
  constraint world_statement_version_body_chk check(length(btrim(body)) between 1 and 30000),
  constraint world_statement_version_reason_chk check(
    (version_number=1 and correction_reason is null)
    or (version_number>1 and length(btrim(coalesce(correction_reason,''))) between 5 and 1000)
  )
);
alter table public.world_statements
  add constraint world_statements_current_version_fkey
  foreign key(current_version_id,id)
  references public.world_statement_versions(id,statement_id)
  on delete restrict;
create index world_statements_public_feed_idx
  on public.world_statements(organization_id,published_at desc,id desc)
  where visibility='public' and current_version_id is not null;
create index world_statements_public_global_idx
  on public.world_statements(published_at desc,id desc)
  where visibility='public' and current_version_id is not null;

alter table public.world_statements enable row level security;
alter table public.world_statement_versions enable row level security;
-- No browser table reads/writes, including directly to historical versions.
-- Security-definer functions implement the sole authorized boundary.
revoke all on table public.world_statements,public.world_statement_versions
  from public,anon,authenticated,service_role;

-- Public list is bounded and publication-gated on BOTH statement and
-- institution. Explicit identity/attribution fields only; never return users.
create or replace function public.world_statement_feed_v1(
  p_organization_slug text default null,
  p_offset integer default 0,
  p_limit integer default 12
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $feed$
declare v_result jsonb;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000 or
     p_limit is null or p_limit < 1 or p_limit > 24 or
     (p_organization_slug is not null and
       (length(p_organization_slug) > 80 or
        lower(btrim(p_organization_slug)) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  with limited as (
    select statement_row.id,statement_row.title,statement_row.published_at,
      statement_row.statement_type,statement_row.revision,
      org.slug as organization_slug,org.short_name as organization_name,
      office_row.title as office_title,
      issuer.display_name as issuer_name
    from public.world_statements statement_row
    join public.world_organizations org
      on org.id=statement_row.organization_id and org.public_visibility='public'
    left join public.world_organization_offices office_row
      on office_row.id=statement_row.issuing_office_id
       and office_row.organization_id=statement_row.organization_id
    left join public.delegation_people issuer
      on issuer.id=statement_row.issuing_person_id
    where statement_row.visibility='public'
      and statement_row.current_version_id is not null
      and (p_organization_slug is null or
           org.slug=lower(btrim(p_organization_slug)))
    order by statement_row.published_at desc,statement_row.id desc
    limit p_limit+1 offset p_offset
  ), numbered as (
    select limited.*,row_number() over(order by published_at desc,id desc) as rn
    from limited
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'publishedAt',published_at,
      'statementType',statement_type,'revision',revision,
      'organizationSlug',organization_slug,'organizationName',organization_name,
      'officeTitle',office_title,'issuerName',issuer_name
    ) order by published_at desc,id desc) filter(where rn<=p_limit),'[]'::jsonb),
    'hasMore',count(*)>p_limit,
    'offset',p_offset
  ) into v_result from numbered;
  return v_result;
end
$feed$;

-- Historical version content is read only with a canonical public statement
-- identity. A nonpublic organization and a nonexistent row are equivalent.
create or replace function public.world_statement_detail_v1(
  p_statement_id uuid,p_version_number integer default null
) returns jsonb language sql stable security definer
set search_path=pg_catalog as $detail$
  select jsonb_build_object(
    'id',s.id,'organizationSlug',org.slug,'organizationName',org.official_name,
    'statementType',s.statement_type,'officeTitle',office_row.title,
    'issuerName',issuer.display_name,'publishedAt',s.published_at,
    'updatedAt',s.updated_at,'revision',s.revision,
    'currentVersion',s.revision,'shownVersion',v.version_number,
    'title',v.title,'body',v.body,
    'correctionReason',v.correction_reason,'versionPublishedAt',v.published_at
  )
  from public.world_statements s
  join public.world_organizations org
    on org.id=s.organization_id and org.public_visibility='public'
  join public.world_statement_versions v
    on v.statement_id=s.id
    and v.version_number=coalesce(p_version_number,s.revision)
  left join public.world_organization_offices office_row
    on office_row.id=s.issuing_office_id and office_row.organization_id=s.organization_id
  left join public.delegation_people issuer on issuer.id=s.issuing_person_id
  where s.id=p_statement_id and s.visibility='public'
    and s.current_version_id is not null
    and (p_version_number is null or p_version_number>=1)
$detail$;

-- Version metadata has independent bounded pagination; no full-body bulk read.
create or replace function public.world_statement_history_v1(
  p_statement_id uuid,p_offset integer default 0,p_limit integer default 12
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $history$
declare v_result jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000
    or p_limit is null or p_limit<1 or p_limit>24
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  if not exists (
    select 1 from public.world_statements s
    join public.world_organizations org
      on org.id=s.organization_id and org.public_visibility='public'
    where s.id=p_statement_id and s.visibility='public'
      and s.current_version_id is not null
  ) then return null; end if;
  with numbered as (
    select v.version_number,v.published_at,v.correction_reason,
      row_number() over(order by v.version_number desc) as rn
    from public.world_statement_versions v
    where v.statement_id=p_statement_id
    order by v.version_number desc
    limit p_limit+1 offset p_offset
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'version',version_number,'publishedAt',published_at,
      'correctionReason',correction_reason
    ) order by version_number desc) filter(where rn<=p_limit),'[]'::jsonb),
    'hasMore',count(*)>p_limit,'offset',p_offset
  ) into v_result from numbered;
  return v_result;
end
$history$;

-- Publication context never exports another user's office or private
-- institutional data. Used on explicit user action, not a public page crawl.
create or replace function public.world_statement_manage_context_v1(
  p_organization_slug text
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog as $context$
declare v_org public.world_organizations%rowtype;
  v_org_allowed boolean;
  v_offices jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  select * into v_org from public.world_organizations org
  where org.slug=lower(btrim(p_organization_slug))
    and org.public_visibility='public'
    and org.status in ('active','recognized');
  if v_org.id is null then
    raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  v_org_allowed:=public.world_access_allowed(
    'world.statement.publish',v_org.id,null,null,null,null);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',office_row.id,'title',office_row.title
  ) order by office_row.display_priority),'[]'::jsonb)
  into v_offices
  from public.world_organization_offices office_row
  where office_row.organization_id=v_org.id and office_row.active
    and exists(
      select 1 from public.world_office_terms term_row
      where term_row.office_id=office_row.id
        and term_row.holder_user_id=auth.uid()
        and term_row.status='active' and term_row.ends_at is null
    )
    and public.world_access_allowed(
      'world.statement.publish',v_org.id,null,office_row.organ_id,null,null);
  if not v_org_allowed and jsonb_array_length(v_offices)=0 then
    raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  return jsonb_build_object(
    'organizationId',v_org.id,'organizationSlug',v_org.slug,
    'canPublishAsOrganization',v_org_allowed,'offices',v_offices);
end
$context$;

-- New publication, with server-derived issuer. Never accept caller-supplied
-- person identity, actor IDs, publication timestamp, result version or event.
create or replace function public.world_publish_statement_v1(
  p_organization_id uuid,p_office_id uuid,p_title text,p_body text,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog as $publish$
declare
  v_org public.world_organizations%rowtype;
  v_office public.world_organization_offices%rowtype;
  v_person_id uuid;
  v_claim jsonb;
  v_op uuid;
  v_statement_id uuid;
  v_version_id uuid;
  v_receipt jsonb;
begin
  if auth.uid() is null or p_organization_id is null or
     nullif(btrim(coalesce(p_title,'')),'') is null or
     length(btrim(p_title))>180 or
     nullif(btrim(coalesce(p_body,'')),'') is null or
     length(btrim(p_body))>30000
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  select * into v_org from public.world_organizations
  where id=p_organization_id and public_visibility='public'
    and status in ('active','recognized') for share;
  if v_org.id is null then
    raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if p_office_id is not null then
    select * into v_office from public.world_organization_offices
    where id=p_office_id and organization_id=p_organization_id and active;
    if v_office.id is null then
      raise exception using errcode='42501',message='AUTHORIZATION'; end if;
    select term_row.holder_person_id into v_person_id
    from public.world_office_terms term_row
    where term_row.office_id=p_office_id and term_row.status='active'
      and term_row.ends_at is null and term_row.holder_user_id=auth.uid();
    if v_person_id is null then
      raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  end if;
  if not public.world_access_allowed(
    'world.statement.publish',p_organization_id,null,v_office.organ_id,null,null
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.statement.publish','R2',
    jsonb_build_object('organizationId',p_organization_id,
      'subjectType','world_statement'),
    jsonb_build_object('officeId',p_office_id,'title',btrim(p_title),
      'body',btrim(p_body))
  );
  v_op:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_op)
      || jsonb_build_object('replayed',true); end if;
  insert into public.world_statements(
    organization_id,statement_type,issuing_office_id,issuing_person_id,title,body
  ) values (
    p_organization_id,
    case when p_office_id is null then 'organization' else 'officeholder' end,
    p_office_id,v_person_id,btrim(p_title),btrim(p_body)
  ) returning id into v_statement_id;
  insert into public.world_statement_versions(
    statement_id,version_number,title,body,published_by_user_id
  ) values (v_statement_id,1,btrim(p_title),btrim(p_body),auth.uid())
    returning id into v_version_id;
  update public.world_statements set current_version_id=v_version_id
    where id=v_statement_id;
  perform private.v3_emit_domain_event(
    'world.statement.published','world_statement',v_statement_id::text,1,
    v_op,null,null,
    jsonb_build_object('organizationId',p_organization_id,
      'statementId',v_statement_id,'version',1,'visibility','public'),
    1,array[]::text[]
  );
  v_receipt:=jsonb_build_object('ok',true,'statementId',v_statement_id,
    'revision',1,'operationId',v_op);
  perform private.studio2_complete_operation(v_op,v_receipt);
  return public.studio2_reconcile_operation(v_op)
    || jsonb_build_object('replayed',false);
end
$publish$;

-- Corrections never mutate the authored content of a published version.
-- Optimistic revision guards and the row lock serialize concurrent editors.
create or replace function public.world_correct_statement_v1(
  p_statement_id uuid,p_expected_revision bigint,
  p_title text,p_body text,p_reason text,p_operation_id uuid,
  p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog as $correct$
declare
  v_statement public.world_statements%rowtype;
  v_office public.world_organization_offices%rowtype;
  v_claim jsonb;v_op uuid;v_version_id uuid;v_receipt jsonb;v_revision bigint;
begin
  if auth.uid() is null or p_statement_id is null or
     p_expected_revision is null or p_expected_revision<1 or
     nullif(btrim(coalesce(p_title,'')),'') is null or length(btrim(p_title))>180 or
     nullif(btrim(coalesce(p_body,'')),'') is null or length(btrim(p_body))>30000 or
     length(btrim(coalesce(p_reason,'')))<5 or length(btrim(p_reason))>1000
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  select s.* into v_statement
  from public.world_statements s
  join public.world_organizations org on org.id=s.organization_id
    and org.public_visibility='public' and org.status in ('active','recognized')
  where s.id=p_statement_id and s.visibility='public'
    and s.current_version_id is not null
  for update of s;
  if v_statement.id is null then
    raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if v_statement.issuing_office_id is not null then
    select * into v_office from public.world_organization_offices
    where id=v_statement.issuing_office_id and organization_id=v_statement.organization_id;
  end if;
  if not (
    public.world_access_allowed(
      'world.statement.publish',v_statement.organization_id,null,null,null,null)
    or (
      v_office.id is not null
      and exists (
        select 1 from public.world_office_terms term_row
        where term_row.office_id=v_office.id
          and term_row.holder_user_id=auth.uid()
          and term_row.status='active' and term_row.ends_at is null
      )
      and public.world_access_allowed(
        'world.statement.publish',v_statement.organization_id,null,
        v_office.organ_id,null,null)
    )
  ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.statement.correct','R2',
    jsonb_build_object('organizationId',v_statement.organization_id,
      'subjectType','world_statement','statementId',p_statement_id),
    jsonb_build_object('expectedRevision',p_expected_revision,
      'title',btrim(p_title),'body',btrim(p_body),'reason',btrim(p_reason))
  );
  v_op:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_op)
      || jsonb_build_object('replayed',true); end if;
  if v_statement.revision<>p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  if v_statement.title=btrim(p_title) and v_statement.body=btrim(p_body) then
    raise exception using errcode='23514',message='NO_CHANGE'; end if;
  v_revision:=v_statement.revision+1;
  insert into public.world_statement_versions(
    statement_id,version_number,title,body,correction_reason,published_by_user_id
  ) values (
    p_statement_id,v_revision,btrim(p_title),btrim(p_body),btrim(p_reason),auth.uid()
  ) returning id into v_version_id;
  update public.world_statements set title=btrim(p_title),body=btrim(p_body),
    current_version_id=v_version_id,updated_at=now(),revision=v_revision
    where id=p_statement_id;
  perform private.v3_emit_domain_event(
    'world.statement.corrected','world_statement',p_statement_id::text,v_revision,
    v_op,null,null,
    jsonb_build_object('organizationId',v_statement.organization_id,
      'statementId',p_statement_id,'version',v_revision,
      'previousVersion',v_statement.revision,'visibility','public'),
    1,array[]::text[]
  );
  v_receipt:=jsonb_build_object('ok',true,'statementId',p_statement_id,
    'revision',v_revision,'operationId',v_op);
  perform private.studio2_complete_operation(v_op,v_receipt);
  return public.studio2_reconcile_operation(v_op)
    || jsonb_build_object('replayed',false);
end
$correct$;

revoke all on function public.world_statement_feed_v1(text,integer,integer),
  public.world_statement_detail_v1(uuid,integer),
  public.world_statement_history_v1(uuid,integer,integer),
  public.world_statement_manage_context_v1(text),
  public.world_publish_statement_v1(uuid,uuid,text,text,uuid,text,uuid),
  public.world_correct_statement_v1(uuid,bigint,text,text,text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.world_statement_feed_v1(text,integer,integer),
  public.world_statement_detail_v1(uuid,integer),
  public.world_statement_history_v1(uuid,integer,integer)
  to anon,authenticated,service_role;
grant execute on function public.world_statement_manage_context_v1(text),
  public.world_publish_statement_v1(uuid,uuid,text,text,uuid,text,uuid),
  public.world_correct_statement_v1(uuid,bigint,text,text,text,uuid,text,uuid)
  to authenticated,service_role;

do $contract$
begin
  if to_regprocedure(
    'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
  ) is not null then
    perform public.v3_register_migration_contract(
      'v3.tg9.world-statement-publication',1,'forward_fix_only',false,null,
      'Publish canonical official statements and correction versions through R2 receipts, scoped authority, immutable history and publication-gated public RPCs.'
    );
  end if;
end
$contract$;

notify pgrst,'reload schema';
commit;

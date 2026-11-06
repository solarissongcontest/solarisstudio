begin;

-- TG9: official public institutional statements. This is NOT a second document,
-- notification, follow or Task Engine store. The historical author is retained.
-- The release gate remains terra_world_public, default OFF.
insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
 ('world.statement.publish','world','Publish institutional statement','Publish an official statement for an authorized international institution.','approve'),
 ('world.statement.correct','world','Correct institutional statement','Publish an attributed correction; never edit a prior published version.','approve')
on conflict (key) do nothing;

-- Initial constitutionally authorized officeholders. Other unions must explicitly
-- grant their own office capabilities; a matching office type is NOT sufficient.
insert into public.world_office_capabilities (office_id, capability)
select o.id, c.capability
from public.world_organization_offices o
join public.world_organizations org on org.id = o.organization_id
cross join (values ('world.statement.publish'),('world.statement.correct')) c(capability)
where (org.slug = 'guard' and o.slug in ('chairperson','deputy-chairperson'))
   or (org.slug = 'unity' and o.slug in ('secretary-general','deputy-secretary-general'))
on conflict do nothing;

create table public.world_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  issuing_office_id uuid references public.world_organization_offices(id) on delete restrict,
  issuing_person_id uuid references public.delegation_people(id) on delete restrict,
  current_version_id uuid,
  current_revision bigint not null default 1 check (current_revision > 0),
  status text not null default 'published' check (status in ('published','withdrawn')),
  visibility text not null default 'public' check (visibility in ('public','members','private')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint world_statement_issuer_consistency check (
    (issuing_office_id is null and issuing_person_id is null)
    or (issuing_office_id is not null and issuing_person_id is not null)
  )
);

create table public.world_statement_versions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.world_statements(id) on delete restrict,
  version_number bigint not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 1 and 220),
  body text not null check (length(btrim(body)) between 1 and 50000),
  correction_reason text,
  published_at timestamptz not null default now(),
  unique(statement_id, version_number),
  unique(statement_id, id),
  constraint world_statement_version_correction_reason check (
    (version_number = 1 and correction_reason is null)
    or (version_number > 1 and length(btrim(correction_reason)) between 5 and 2000)
  )
);
alter table public.world_statements
  add constraint world_statement_current_version_same_statement_fk
  foreign key (id, current_version_id)
  references public.world_statement_versions(statement_id, id) on delete restrict;

create index world_statements_public_org_idx
  on public.world_statements(organization_id, published_at desc, id)
  where status = 'published' and visibility = 'public';
create index world_statement_versions_history_idx
  on public.world_statement_versions(statement_id, version_number desc);

-- History can only grow. No UPDATE or DELETE of a published version, including
-- changes via privileged SQL; corrections must append a new version.
create function private.world_prevent_statement_version_rewrite()
returns trigger language plpgsql security invoker
set search_path = pg_catalog
as $immutable$
begin
  raise exception using errcode = '42501', message = 'PUBLISHED_STATEMENT_VERSION_IMMUTABLE';
end
$immutable$;
create trigger world_statement_versions_immutable
before update or delete on public.world_statement_versions
for each row execute function private.world_prevent_statement_version_rewrite();

alter table public.world_statements enable row level security;
alter table public.world_statement_versions enable row level security;
revoke all on public.world_statements, public.world_statement_versions from public, anon, authenticated;
grant select on public.world_statements, public.world_statement_versions to anon, authenticated;
grant all on public.world_statements, public.world_statement_versions to service_role;

create policy world_statements_published_public_read on public.world_statements
for select to anon, authenticated using (
  status = 'published' and visibility = 'public'
  and exists (
    select 1 from public.world_organizations org
    where org.id = organization_id and org.public_visibility = 'public'
      and org.status in ('recognized','active','suspended','historical')
  )
);
create policy world_statement_versions_published_public_read on public.world_statement_versions
for select to anon, authenticated using (
  exists (
    select 1 from public.world_statements statement_row
    where statement_row.id = statement_id
      and statement_row.status = 'published'
      and statement_row.visibility = 'public'
      and exists (
        select 1 from public.world_organizations org
        where org.id = statement_row.organization_id
          and org.public_visibility = 'public'
          and org.status in ('recognized','active','suspended','historical')
      )
  )
);

-- Single authoritative operation for a new publication (id NULL, expected 0)
-- or correction (existing id, expected > 0). Replays return the same receipt.
create function public.world_issue_statement_v1(
  p_organization_id uuid,
  p_statement_id uuid,
  p_issuing_office_id uuid,
  p_title text,
  p_body text,
  p_correction_reason text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog
as $issue$
declare
  v_actor uuid := auth.uid();
  v_claim jsonb;
  v_operation_id uuid;
  v_statement public.world_statements%rowtype;
  v_office_person uuid;
  v_statement_id uuid;
  v_version_id uuid;
  v_revision bigint;
  v_result jsonb;
begin
  if v_actor is null or p_organization_id is null or p_expected_revision is null
     or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null
     or p_title is null or length(btrim(p_title)) not between 1 and 220
     or p_body is null or length(btrim(p_body)) not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if not exists (
    select 1 from public.world_organizations org
    where org.id = p_organization_id
      and org.status in ('recognized','active')
      and org.public_visibility = 'public'
  ) then
    raise exception using errcode = '23514', message = 'ORGANIZATION_NOT_PUBLISHABLE';
  end if;

  if not public.world_access_allowed(
    case when p_statement_id is null then 'world.statement.publish'
         else 'world.statement.correct' end,
    p_organization_id, null, null,
    case when p_statement_id is null then null else 'statement' end,
    p_statement_id
  ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Office attribution is factual, not a free-form user-selected title.
  if p_issuing_office_id is not null then
    select term.holder_person_id into v_office_person
    from public.world_organization_offices office_row
    join public.world_office_terms term on term.office_id = office_row.id
    where office_row.id = p_issuing_office_id
      and office_row.organization_id = p_organization_id
      and office_row.active
      and term.holder_user_id = v_actor
      and term.status = 'active'
      and term.starts_at <= now()
      and term.ends_at is null
    limit 1;
    if v_office_person is null then
      raise exception using errcode = '42501', message = 'ISSUING_OFFICE_NOT_HELD';
    end if;
  end if;

  if p_statement_id is null then
    if p_expected_revision <> 0 or p_correction_reason is not null then
      raise exception using errcode = '22023', message = 'EXPECTED_REVISION_REQUIRED';
    end if;
  elsif p_expected_revision < 1 or length(btrim(coalesce(p_correction_reason,''))) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'CORRECTION_REASON_REQUIRED';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    case when p_statement_id is null then 'world.statement.publish'
         else 'world.statement.correct' end,
    'R2',
    jsonb_build_object(
      'organizationId', p_organization_id,
      'subjectType', 'world_statement',
      'statementId', p_statement_id
    ),
    jsonb_build_object(
      'organizationId', p_organization_id,
      'statementId', p_statement_id,
      'issuingOfficeId', p_issuing_office_id,
      'title', p_title, 'body', p_body,
      'correctionReason', p_correction_reason,
      'expectedRevision', p_expected_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id) ||
      jsonb_build_object('replayed',true);
  end if;

  if p_statement_id is null then
    insert into public.world_statements (
      organization_id, issuing_office_id, issuing_person_id,
      current_revision, status, visibility
    ) values (
      p_organization_id, p_issuing_office_id, v_office_person,
      1, 'published', 'public'
    ) returning id into v_statement_id;
    v_revision := 1;
  else
    select * into v_statement from public.world_statements
    where id = p_statement_id and organization_id = p_organization_id
    for update;
    if not found or v_statement.status <> 'published'
       or v_statement.visibility <> 'public'
       or v_statement.current_revision <> p_expected_revision
       or v_statement.issuing_office_id is distinct from p_issuing_office_id then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
    v_statement_id := p_statement_id;
    v_revision := p_expected_revision + 1;
  end if;

  insert into public.world_statement_versions(
    statement_id, version_number, title, body, correction_reason
  ) values (
    v_statement_id, v_revision, btrim(p_title), btrim(p_body),
    case when v_revision = 1 then null else btrim(p_correction_reason) end
  ) returning id into v_version_id;

  update public.world_statements
  set current_revision = v_revision, current_version_id = v_version_id
  where id = v_statement_id;

  perform private.v3_emit_domain_event(
    case when v_revision = 1 then 'world.statement.published'
         else 'world.statement.corrected' end,
    'world_statement', v_statement_id::text, v_revision,
    v_operation_id, null, null,
    jsonb_build_object(
      'organizationId',p_organization_id,
      'statementId',v_statement_id,
      'versionId',v_version_id,
      'revision',v_revision,
      'visibility','public',
      'published',true
    ), 1, array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok',true, 'statementId',v_statement_id,
    'versionId',v_version_id, 'revision',v_revision,
    'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) ||
    jsonb_build_object('replayed',false);
end
$issue$;
revoke all on function public.world_issue_statement_v1(
  uuid,uuid,uuid,text,text,text,bigint,uuid,text,uuid
) from public, anon, authenticated;
grant execute on function public.world_issue_statement_v1(
  uuid,uuid,uuid,text,text,text,bigint,uuid,text,uuid
) to authenticated, service_role;

-- Public, bounded, normalized projection. This intentionally returns no
-- accounts, grants, operation payloads or unpublished records.
create function public.world_public_statements_v1(
  p_organization_slug text,
  p_limit integer default 20
)
returns jsonb language sql stable security invoker
set search_path = pg_catalog
as $list$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', published.id,
    'organizationSlug', published.slug,
    'organizationName', published.short_name,
    'issuingOfficeId', published.issuing_office_id,
    'publishedAt', published.published_at,
    'revision', published.current_revision,
    'title', published.title,
    'body', published.body,
    'correctionReason', published.correction_reason
  ) order by published.published_at desc, published.id desc), '[]'::jsonb)
  from (
    select st.id, org.slug, org.short_name, st.issuing_office_id,
           st.published_at, st.current_revision,
           version_row.title, version_row.body, version_row.correction_reason
    from public.world_statements st
    join public.world_organizations org on org.id = st.organization_id
    join public.world_statement_versions version_row on version_row.id = st.current_version_id
    where org.slug = lower(btrim(p_organization_slug))
      and org.public_visibility = 'public'
      and org.status in ('recognized','active','suspended','historical')
      and st.visibility = 'public' and st.status = 'published'
    order by st.published_at desc, st.id desc
    limit least(greatest(coalesce(p_limit,20),1),30)
  ) published
$list$;
revoke all on function public.world_public_statements_v1(text,integer) from public, anon, authenticated;
grant execute on function public.world_public_statements_v1(text,integer)
to anon, authenticated, service_role;

create function public.world_public_statement_history_v1(p_statement_id uuid)
returns jsonb language sql stable security invoker
set search_path = pg_catalog
as $detail$
  select jsonb_build_object(
    'id', st.id, 'organizationSlug', org.slug,
    'organizationName', org.short_name,
    'issuingOfficeId', st.issuing_office_id,
    'issuedByPersonId', st.issuing_person_id,
    'publishedAt', st.published_at,
    'revision', st.current_revision,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'revision', v.version_number,
        'title', v.title, 'body', v.body,
        'correctionReason', v.correction_reason,
        'publishedAt', v.published_at
      ) order by v.version_number desc)
      from public.world_statement_versions v
      where v.statement_id = st.id
    ),'[]'::jsonb)
  )
  from public.world_statements st
  join public.world_organizations org on org.id = st.organization_id
  where st.id = p_statement_id
    and st.status = 'published' and st.visibility = 'public'
    and org.public_visibility = 'public'
    and org.status in ('recognized','active','suspended','historical')
$detail$;
revoke all on function public.world_public_statement_history_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_public_statement_history_v1(uuid)
to anon, authenticated, service_role;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg9.official-statements',1,'forward_fix_only',false,null,
      'Immutable official statement versions; scoped capability + operation receipt; publication-safe public projections. No optional fan notification publisher yet.'
    );
  end if;
end
$contract$;
notify pgrst, 'reload schema';
commit;

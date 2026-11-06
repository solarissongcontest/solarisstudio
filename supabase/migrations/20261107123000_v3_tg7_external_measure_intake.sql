begin;

-- WORLD-05 TG7: a raw external DM/message is not a registered proposal.
-- The TG7 world_measures / versions remain the sole formal measure authority.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg7.external-measure-provenance',1,'forward_fix_only',false,null,
      'Record private external proposal provenance, then governed one-time introduction into existing TG7 measures. No implicit public registration.'
    );
  end if;
end $contract$;

-- TG7 #1985 already registers this capability; this is an idempotent
-- forward migration for schemas where that seed predates this workflow.
insert into public.studio2_capabilities(key,domain,label,description,access_level)
values ('world.measure.register_external','world','Record external proposal intake',
  'Preserve DM/Instagram procedural provenance and separately introduce a valid external submission.','approve')
on conflict (key) do nothing;

insert into public.world_office_capabilities(office_id,capability)
select office_row.id,'world.measure.register_external'
from public.world_organization_offices office_row
join public.world_organizations o on o.id=office_row.organization_id
where (o.slug='guard' and office_row.slug='chairperson')
   or (o.slug='unity' and office_row.slug='secretary-general')
on conflict do nothing;

create table private.world_measure_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  submitted_by_country_id uuid not null references public.countries(id) on delete restrict,
  source_channel text not null,
  source_reference text,
  received_by_user_id uuid not null,
  received_at timestamptz not null default now(),
  raw_title text not null,
  raw_text text not null,
  raw_attachments jsonb not null default '[]'::jsonb,
  source_note text,
  content_hash text not null,
  status text not null default 'received',
  introduced_measure_id uuid unique references public.world_measures(id) on delete restrict,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_measure_external_source_check
    check(source_channel in ('dm','instagram','other')),
  constraint world_measure_external_source_reference_check
    check(source_reference is null or length(source_reference)<=500),
  constraint world_measure_external_title_check
    check(length(btrim(raw_title)) between 1 and 180),
  constraint world_measure_external_text_check
    check(length(btrim(raw_text)) between 1 and 25000),
  constraint world_measure_external_attachments_check
    check(jsonb_typeof(raw_attachments)='array'
          and jsonb_array_length(raw_attachments)<=20
          and octet_length(raw_attachments::text)<=32768),
  constraint world_measure_external_note_check
    check(source_note is null or length(source_note)<=2000),
  constraint world_measure_external_hash_check
    check(content_hash ~ '^[0-9a-f]{64}$'),
  constraint world_measure_external_status_check
    check(status in ('received','introduced')),
  constraint world_measure_external_revision_check check(revision>=1),
  constraint world_measure_external_state_pair_check
    check((status='received' and introduced_measure_id is null)
       or (status='introduced' and introduced_measure_id is not null))
);
create index world_measure_intakes_org_status_idx
 on private.world_measure_intakes(organization_id,status,received_at desc);
create index world_measure_intakes_country_idx
 on private.world_measure_intakes(submitted_by_country_id,received_at desc);

-- A measure may link to one preserved source intake only. An intake cannot be
-- converted to two conflicting formal measures even under concurrent requests.
alter table public.world_measures add constraint world_measures_external_intake_fk
  foreign key(intake_id) references private.world_measure_intakes(id) on delete restrict;
create unique index world_measures_one_external_intake_uidx
  on public.world_measures(intake_id) where intake_id is not null;

-- Database structural integrity, not merely an RPC conditional: a raw
-- message from Country A / Organization X cannot be attached to a proposal
-- attributed to Country B / Organization Y.
alter table private.world_measure_intakes
  add constraint world_external_intake_composite_identity
  unique (id,organization_id,submitted_by_country_id,source_channel);
alter table public.world_measures
  add constraint world_measures_intake_source_identity_fk
  foreign key (intake_id,organization_id,sponsor_country_id,source_channel)
  references private.world_measure_intakes(
    id,organization_id,submitted_by_country_id,source_channel)
  on delete restrict;

alter table private.world_measure_intakes enable row level security;
revoke all on private.world_measure_intakes from public,anon,authenticated,service_role;
-- No client or service-role raw reads of private message provenance.

create or replace function private.world_measure_intake_immutable_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $intake_guard$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='IMMUTABLE_EXTERNAL_INTAKE';
  end if;
  if old.status='received' and new.status='introduced'
     and old.introduced_measure_id is null
     and new.introduced_measure_id is not null
     and new.revision=old.revision+1
     and (to_jsonb(new)-'status'-'introduced_measure_id'-'revision')
       = (to_jsonb(old)-'status'-'introduced_measure_id'-'revision')
  then return new; end if;
  raise exception using errcode='23514',message='IMMUTABLE_EXTERNAL_INTAKE';
end $intake_guard$;
create trigger world_measure_external_intake_history_guard
before update or delete on private.world_measure_intakes
for each row execute function private.world_measure_intake_immutable_v1();
revoke all on function private.world_measure_intake_immutable_v1()
 from public,anon,authenticated,service_role;

-- Org-wide authorized reviewer only; never expose this endpoint to fans,
-- applicant country controllers, anonymous readers or the World Search.
create or replace function public.world_external_intakes_manage_v1(
  p_organization_id uuid
) returns jsonb language sql stable security definer
set search_path=pg_catalog
as $private_intakes$
  select case
    when not coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
      or auth.uid() is null
      or p_organization_id is null
      or not public.world_access_allowed(
        'world.measure.register_external',p_organization_id,null,null,null,null)
    then null
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'organizationId',i.organization_id,
        'countryId',i.submitted_by_country_id,
        'countryCode',c.short_code,
        'sourceChannel',i.source_channel,
        'sourceReference',i.source_reference,
        'receivedAt',i.received_at,
        'rawTitle',i.raw_title,'rawText',i.raw_text,
        'sourceNote',i.source_note,'contentHash',i.content_hash,
        'status',i.status,'revision',i.revision,
        'introducedMeasureId',i.introduced_measure_id
      ) order by i.received_at desc,i.id),'[]'::jsonb)
      from (
        select *
        from private.world_measure_intakes
        where organization_id=p_organization_id
        order by received_at desc,id
        limit 30
      ) i
      join public.countries c on c.id=i.submitted_by_country_id
    ),'[]'::jsonb)
  end
$private_intakes$;
revoke all on function public.world_external_intakes_manage_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_external_intakes_manage_v1(uuid)
 to authenticated,service_role;

-- Private capability-filtered chooser is not limited to PUBLIC institutions;
-- authorized officers may record private institution messages.
create or replace function public.world_external_intake_institutions_v1()
returns jsonb language sql stable security definer set search_path=pg_catalog
as $intake_institutions$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'slug',i.slug,'shortName',i.short_name
  ) order by i.short_name),'[]'::jsonb)
  from (
    select org.id,org.slug,org.short_name
    from public.world_organizations org
    where coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
      and auth.uid() is not null and org.status='active'
      and public.world_access_allowed(
        'world.measure.register_external',org.id,null,null,null,null)
    order by org.short_name,org.id limit 30
  ) i
$intake_institutions$;
revoke all on function public.world_external_intake_institutions_v1()
 from public,anon,authenticated,service_role;
grant execute on function public.world_external_intake_institutions_v1()
 to authenticated,service_role;

create or replace function public.world_external_intake_options_v1(
  p_organization_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $intake_options$
  select case when not coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
    or auth.uid() is null or p_organization_id is null or
    not public.world_access_allowed(
      'world.measure.register_external',p_organization_id,null,null,null,null)
    then null else jsonb_build_object(
      'organs',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',o.id,'name',o.name
        ) order by o.sort_order,o.name),'[]'::jsonb)
        from (select id,name,sort_order from public.world_organization_organs
              where organization_id=p_organization_id and status='active'
              order by sort_order,name limit 60) o
      ),'[]'::jsonb),
      'countries',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,'name',c.name,'shortCode',c.short_code
        ) order by c.name),'[]'::jsonb)
        from (select id,name,short_code from public.countries
              order by name,id limit 200) c
      ),'[]'::jsonb),
      'categories',coalesce((
        select jsonb_agg(jsonb_build_object(
          'code',c.code,'label',c.label
        ) order by c.code),'[]'::jsonb)
        from (
          select code,label from public.world_measure_categories
          where organization_id=p_organization_id and active
            and (effective_from is null or effective_from<=now())
            and (effective_to is null or effective_to>now())
          order by code limit 100
        ) c
      ),'[]'::jsonb)
    ) end
$intake_options$;
revoke all on function public.world_external_intake_options_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_external_intake_options_v1(uuid)
 to authenticated,service_role;

comment on table private.world_measure_intakes is
 'TG7 private, immutable DM/Instagram/external raw intake; introducing it creates a separate governed world_measures record. No raw message public projection.';

commit;

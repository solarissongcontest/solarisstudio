begin;

-- WORLD-05 TG7 amendment provenance. Official measures and immutable versions
-- from #1985 remain authoritative. No amendment can be adopted via this slice.
do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
   perform public.v3_register_migration_contract(
     'v3.tg7.measure-amendments',1,'forward_fix_only',false,null,
     'Immutable proposed formal amendments and sponsor withdrawal, pending separate governed voting/acceptance and version-incorporation.'
   );
 end if;
end $contract$;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values ('world.amendment.submit','world','Propose institutional amendment',
  'Submit or withdraw a textual amendment to a formal measure through current country authority.','operate')
on conflict (key) do nothing;
insert into public.world_country_controller_capabilities(capability)
values ('world.amendment.submit') on conflict do nothing;

create table public.world_measure_amendments (
 id uuid primary key default gen_random_uuid(),
 measure_id uuid not null references public.world_measures(id) on delete restrict,
 organization_id uuid not null references public.world_organizations(id) on delete restrict,
 sponsor_country_id uuid not null references public.countries(id) on delete restrict,
 base_version_id uuid not null,
 target_provision_id text,
 current_text text not null,
 proposed_text text not null,
 reasoning text not null,
 state text not null default 'proposed',
 related_vote_id uuid,
 incorporated_version_id uuid,
 submitted_at timestamptz not null default now(),
 withdrawn_at timestamptz,
 submitted_by_user_id uuid,
 revision bigint not null default 1,
 content_hash text not null,
 constraint world_amendment_base_fk
   foreign key(base_version_id,measure_id)
   references public.world_measure_versions(id,measure_id) on delete restrict,
 constraint world_amendment_incorporated_fk
   foreign key(incorporated_version_id,measure_id)
   references public.world_measure_versions(id,measure_id) on delete restrict,
 constraint world_amendment_status_check
   check(state in ('proposed','accepted','rejected','withdrawn','superseded')),
 constraint world_amendment_state_pair_check
   check((state='withdrawn' and withdrawn_at is not null)
      or (state<>'withdrawn' and withdrawn_at is null)),
 constraint world_amendment_review_state_check
   check((state in ('accepted','rejected','superseded') and related_vote_id is not null)
       or state not in ('accepted','rejected','superseded')),
 constraint world_amendment_incorporated_state_check
   check(incorporated_version_id is null or state='accepted'),
 constraint world_amendment_provision_identity_check
   check(target_provision_id is null or length(btrim(target_provision_id)) between 3 and 180),
 constraint world_amendment_excerpt_check
   check(length(btrim(current_text)) between 1 and 5000),
 constraint world_amendment_proposed_check
   check(length(btrim(proposed_text)) between 1 and 5000
     and btrim(proposed_text)<>btrim(current_text)),
 constraint world_amendment_reason_check
   check(length(btrim(reasoning)) between 8 and 3000),
 constraint world_amendment_revision_check check(revision>=1),
 constraint world_amendment_hash_check check(content_hash ~ '^[0-9a-f]{64}$'),
 unique(measure_id,sponsor_country_id,base_version_id,content_hash)
);
create index world_amendment_measure_history_idx
 on public.world_measure_amendments(measure_id,submitted_at desc);
create index world_amendment_sponsor_idx
 on public.world_measure_amendments(sponsor_country_id,submitted_at desc);
alter table public.world_measure_amendments enable row level security;
revoke all on public.world_measure_amendments
  from public,anon,authenticated,service_role;

-- No direct source amendments on a privileged access token. Later acceptance
-- must arrive as a reviewed, real vote/decision-backed schema+command slice.
create or replace function private.world_amendment_history_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $amend_guard$
begin
 if tg_op='DELETE' then
   raise exception using errcode='23514',message='IMMUTABLE_AMENDMENT_HISTORY'; end if;
 if old.state='proposed' and new.state='withdrawn'
    and new.withdrawn_at is not null
    and new.revision=old.revision+1
    and (to_jsonb(new)-'state'-'withdrawn_at'-'revision')
      = (to_jsonb(old)-'state'-'withdrawn_at'-'revision')
 then return new; end if;
 raise exception using errcode='23514',message='IMMUTABLE_AMENDMENT_HISTORY';
end $amend_guard$;
create trigger world_amendment_history_guard
 before update or delete on public.world_measure_amendments
 for each row execute function private.world_amendment_history_guard_v1();
revoke all on function private.world_amendment_history_guard_v1()
 from public,anon,authenticated,service_role;

-- This trigger validates the measure/sponsor institution pair even against a
-- privileged/direct import, rather than trusting a frontend-selected org.
create or replace function private.world_amendment_identity_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $identity$
declare
  v_org uuid;
begin
 select m.organization_id into v_org
 from public.world_measures m where m.id=new.measure_id;
 if v_org is null or v_org<>new.organization_id then
   raise exception using errcode='23514',message='AMENDMENT_MEASURE_ORGANIZATION_MISMATCH'; end if;
 return new;
end $identity$;
create trigger world_amendment_identity_guard
 before insert on public.world_measure_amendments
 for each row execute function private.world_amendment_identity_guard_v1();
revoke all on function private.world_amendment_identity_guard_v1()
 from public,anon,authenticated,service_role;

-- The participant is allowed to see only their current country submissions.
-- A scoped officer may inspect all formal amendment proposals for review.
create or replace function public.world_measure_amendments_manage_v1(
 p_measure_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $amendments_manage$
 select case
  when not coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
    or auth.uid() is null or p_measure_id is null then null
  else (
   select case when not (
       public.world_access_allowed('world.measure.review_procedural',
         m.organization_id,m.sponsor_country_id,m.organ_id,null,null)
       or exists(select 1 from public.country_accounts acct
         where acct.user_id=auth.uid() and acct.status='active'
           and acct.country_id in (
             select a.sponsor_country_id from public.world_measure_amendments a
             where a.measure_id=p_measure_id
           ))
       or exists(select 1 from public.country_accounts acct
         where acct.user_id=auth.uid() and acct.status='active'
           and acct.country_id in (
             select membership.country_id from public.world_organization_memberships membership
             where membership.organization_id=m.organization_id
               and membership.status='member' and membership.ended_at is null
               and membership.joined_at<=now()
           ))
     ) then null
     else jsonb_build_object(
       'measureId',m.id,'organizationId',m.organization_id,'organId',m.organ_id,
       'measureTitle',v.title,'currentVersionId',v.id,
       'measureState',m.state,'measureRevision',m.revision,
       'amendments',coalesce((
         select jsonb_agg(jsonb_build_object(
           'id',x.id,'sponsorCountryId',x.sponsor_country_id,
           'sponsorCountryCode',c.short_code,
           'baseVersionId',x.base_version_id,
           'currentText',x.current_text,'proposedText',x.proposed_text,
           'reasoning',x.reasoning,'state',x.state,
           'submittedAt',x.submitted_at,'withdrawnAt',x.withdrawn_at,
           'revision',x.revision,'contentHash',x.content_hash,
           'relatedVoteId',x.related_vote_id,'incorporatedVersionId',x.incorporated_version_id
         ) order by x.submitted_at desc,x.id),'[]'::jsonb)
         from (
           select amendment.*
           from public.world_measure_amendments amendment
           where amendment.measure_id=m.id
             and (
               public.world_access_allowed('world.measure.review_procedural',
                 m.organization_id,m.sponsor_country_id,m.organ_id,null,null)
               or exists(select 1 from public.country_accounts account
                  where account.user_id=auth.uid() and account.status='active'
                    and account.country_id=amendment.sponsor_country_id)
             )
           order by amendment.submitted_at desc,amendment.id limit 30
         ) x join public.countries c on c.id=x.sponsor_country_id
       ),'[]'::jsonb)
     ) end
   from public.world_measures m
   join public.world_measure_versions v on v.id=m.current_version_id
   where m.id=p_measure_id
   limit 1
  ) end
$amendments_manage$;
revoke all on function public.world_measure_amendments_manage_v1(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_measure_amendments_manage_v1(uuid)
 to authenticated,service_role;

comment on table public.world_measure_amendments is
 'TG7 immutable textual amendment submissions to a frozen measure version. This first slice has no acceptance/winner authority; TG8-certified decisions are required to incorporate a future version.';

commit;

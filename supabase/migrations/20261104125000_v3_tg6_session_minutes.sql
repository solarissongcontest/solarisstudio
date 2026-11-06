begin;

-- TG6 minutes are a governed record of an EXISTING institutional session.
-- This neither certifies quorum nor independently creates voting results.
-- Follow #1950 -> #2028 -> #2035 migration ordering.
insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
 ('world.minutes.manage','world','Draft institutional minutes',
  'Prepare and submit scoped institutional meeting minutes.','operate'),
 ('world.minutes.publish','world','Publish institutional minutes',
  'Publish reviewed minutes after the official session has concluded.','operate')
on conflict(key) do nothing;

insert into public.world_office_capabilities(office_id,capability)
select office_row.id, grant_row.capability
from public.world_organization_offices office_row
join public.world_organizations org on org.id=office_row.organization_id
join (values ('guard','chairperson'),('unity','secretary-general'))
  officer(organization_slug,office_slug)
  on officer.organization_slug=org.slug and officer.office_slug=office_row.slug
cross join (values ('world.minutes.manage'),('world.minutes.publish'))
  grant_row(capability)
on conflict do nothing;

create table public.world_session_minutes (
 session_id uuid primary key references public.world_sessions(id) on delete restrict,
 status text not null default 'draft'
   check (status in ('draft','in_review','published')),
 summary text not null default '' check (length(summary)<=1200),
 body text not null default '' check (length(body)<=20000),
 revision bigint not null default 1 check (revision>=1),
 published_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint world_minutes_publication_pair
   check ((status='published') = (published_at is not null)),
 constraint world_minutes_published_body
   check (status<>'published' or length(btrim(body))>0)
);

-- Each successful mutation creates an immutable, attributable historical
-- snapshot. Actor identifiers never appear in public projections.
create table public.world_session_minutes_revisions (
 session_id uuid not null references public.world_session_minutes(session_id) on delete restrict,
 revision bigint not null check(revision>=1),
 status text not null check(status in ('draft','in_review','published')),
 summary text not null,
 body text not null,
 actor_user_id uuid not null,
 operation_id uuid not null unique,
 recorded_at timestamptz not null default now(),
 agenda_snapshot jsonb,
 attendance_snapshot jsonb,
 primary key(session_id,revision),
 check (agenda_snapshot is null or jsonb_typeof(agenda_snapshot)='array'),
 check (attendance_snapshot is null or jsonb_typeof(attendance_snapshot)='array')
);

alter table public.world_session_minutes enable row level security;
alter table public.world_session_minutes_revisions enable row level security;
revoke all on public.world_session_minutes,public.world_session_minutes_revisions
 from public,anon,authenticated,service_role;
grant all on public.world_session_minutes,public.world_session_minutes_revisions to service_role;

-- A direct privileged write must not silently rewrite a published official
-- document or rewrite history. Corrections require a future governed version.
create or replace function private.world_minutes_integrity_guard_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog
as $guard$
begin
 if TG_OP='DELETE' then
   raise exception using errcode='23514',message='MINUTES_DELETE_FORBIDDEN';
 end if;
 if TG_TABLE_NAME='world_session_minutes_revisions' then
   raise exception using errcode='23514',message='MINUTES_HISTORY_IMMUTABLE';
 end if;
 if old.status='published' then
   raise exception using errcode='23514',message='PUBLISHED_MINUTES_IMMUTABLE';
 end if;
 return new;
end
$guard$;
revoke all on function private.world_minutes_integrity_guard_v1()
 from public,anon,authenticated,service_role;
create trigger world_minutes_current_integrity
before update or delete on public.world_session_minutes
for each row execute function private.world_minutes_integrity_guard_v1();
create trigger world_minutes_revision_integrity
before update or delete on public.world_session_minutes_revisions
for each row execute function private.world_minutes_integrity_guard_v1();

-- Published content only. Anonymity and publication are enforced by this
-- SECURITY DEFINER projection, not by client-side hiding.
create or replace function public.world_session_minutes_public_v1(p_session_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $public$
 select jsonb_build_object(
   'sessionId',m.session_id,'status',m.status,
   'summary',m.summary,'body',m.body,
   'revision',m.revision,'publishedAt',m.published_at)
 from public.world_session_minutes m
 join public.world_sessions s on s.id=m.session_id
 join public.world_organizations o on o.id=s.organization_id
 join public.world_organization_organs g
   on g.id=s.organ_id and g.organization_id=s.organization_id
 where m.session_id=p_session_id and m.status='published'
   and s.visibility='public' and s.status in ('concluded','archived')
   and o.public_visibility='public' and g.visibility='public'
 limit 1
$public$;

create or replace function public.world_session_minutes_manage_v1(p_session_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog
as $manage$
declare
 v_session public.world_sessions%rowtype;
 v_minutes public.world_session_minutes%rowtype;
begin
 select * into v_session from public.world_sessions where id=p_session_id;
 if v_session.id is null or not (
   public.world_access_allowed('world.minutes.manage',
     v_session.organization_id,null,v_session.organ_id,'session',p_session_id)
   or public.world_access_allowed('world.minutes.publish',
     v_session.organization_id,null,v_session.organ_id,'session',p_session_id)
 ) then
   raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 select * into v_minutes from public.world_session_minutes where session_id=p_session_id;
 return jsonb_build_object(
   'sessionId',p_session_id,'title',v_session.title,
   'sessionStatus',v_session.status,'sessionRevision',v_session.revision,
   'status',coalesce(v_minutes.status,'missing'),
   'summary',coalesce(v_minutes.summary,''),
   'body',coalesce(v_minutes.body,''),
   'revision',v_minutes.revision,'publishedAt',v_minutes.published_at,
   'canManage',public.world_access_allowed('world.minutes.manage',
     v_session.organization_id,null,v_session.organ_id,'session',p_session_id),
   'canPublish',public.world_access_allowed('world.minutes.publish',
     v_session.organization_id,null,v_session.organ_id,'session',p_session_id)
 );
end
$manage$;

create or replace function public.world_save_session_minutes_v1(
 p_session_id uuid,p_summary text,p_body text,p_expected_revision bigint,
 p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $save$
declare
 v_session public.world_sessions%rowtype;
 v_minutes public.world_session_minutes%rowtype;
 v_claim jsonb;
 v_op uuid;
 v_revision bigint;
 v_result jsonb;
begin
 if auth.uid() is null or p_session_id is null or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 if p_body is null or length(p_body)>20000
    or p_summary is null or length(p_summary)>1200
 then raise exception using errcode='22023',message='VALIDATION'; end if;
 select * into v_session from public.world_sessions
   where id=p_session_id for update;
 if v_session.id is null or not public.world_access_allowed(
   'world.minutes.manage',v_session.organization_id,null,
   v_session.organ_id,'session',v_session.id
 ) then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 v_claim := private.studio2_claim_operation(
   p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
   'world.session.minutes.save','R2',
   jsonb_build_object('sessionId',p_session_id,'subjectType','world_session_minutes'),
   jsonb_build_object('summary',p_summary,'body',p_body,
      'expectedRevision',p_expected_revision)
 );
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 if v_session.status not in ('open','recessed','concluded')
 then raise exception using errcode='23514',message='SESSION_NOT_EDITABLE'; end if;
 select * into v_minutes from public.world_session_minutes
   where session_id=p_session_id for update;
 if v_minutes.revision is distinct from p_expected_revision then
   raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
 if v_minutes.status='published' then
   raise exception using errcode='23514',message='PUBLISHED_MINUTES_IMMUTABLE'; end if;
 if v_minutes.session_id is null then
   insert into public.world_session_minutes(session_id,status,summary,body,revision)
   values(p_session_id,'draft',p_summary,p_body,1);
   v_revision:=1;
 else
   update public.world_session_minutes
      set status='draft',summary=p_summary,body=p_body,
        revision=revision+1,updated_at=now(),published_at=null
    where session_id=p_session_id;
   v_revision:=v_minutes.revision+1;
 end if;
 insert into public.world_session_minutes_revisions
  (session_id,revision,status,summary,body,actor_user_id,operation_id)
 values(p_session_id,v_revision,'draft',p_summary,p_body,auth.uid(),v_op);
 perform private.v3_emit_domain_event(
   'world.session.minutes.saved','world_session_minutes',p_session_id::text,
   v_revision,v_op,null,null,
   jsonb_build_object('sessionId',p_session_id,'revision',v_revision,
     'status','draft'),1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'sessionId',p_session_id,
   'revision',v_revision,'status','draft','operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end
$save$;

create or replace function public.world_submit_session_minutes_v1(
 p_session_id uuid,p_expected_revision bigint,p_operation_id uuid,
 p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $submit$
declare
 v_session public.world_sessions%rowtype;
 v_minutes public.world_session_minutes%rowtype;
 v_claim jsonb;
 v_op uuid;
 v_revision bigint;
 v_result jsonb;
begin
 if auth.uid() is null or p_session_id is null or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 select * into v_session from public.world_sessions where id=p_session_id for update;
 if v_session.id is null or not public.world_access_allowed(
    'world.minutes.manage',v_session.organization_id,null,
    v_session.organ_id,'session',p_session_id)
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.session.minutes.submit','R2',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_session_minutes'),
    jsonb_build_object('expectedRevision',p_expected_revision));
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 if v_session.status not in ('open','recessed','concluded')
 then raise exception using errcode='23514',message='SESSION_NOT_EDITABLE'; end if;
 select * into v_minutes from public.world_session_minutes
   where session_id=p_session_id for update;
 if v_minutes.session_id is null or v_minutes.status<>'draft'
    or length(btrim(v_minutes.body))=0
 then raise exception using errcode='23514',message='MINUTES_NOT_READY'; end if;
 if v_minutes.revision is distinct from p_expected_revision
 then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
 update public.world_session_minutes
   set status='in_review',revision=revision+1,updated_at=now()
   where session_id=p_session_id;
 v_revision:=v_minutes.revision+1;
 insert into public.world_session_minutes_revisions
  (session_id,revision,status,summary,body,actor_user_id,operation_id)
 values(p_session_id,v_revision,'in_review',v_minutes.summary,
    v_minutes.body,auth.uid(),v_op);
 perform private.v3_emit_domain_event(
   'world.session.minutes.submitted','world_session_minutes',p_session_id::text,
   v_revision,v_op,null,null,
   jsonb_build_object('sessionId',p_session_id,'revision',v_revision,
     'status','in_review'),1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'sessionId',p_session_id,
    'revision',v_revision,'status','in_review','operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end
$submit$;

create or replace function public.world_publish_session_minutes_v1(
 p_session_id uuid,p_expected_revision bigint,p_operation_id uuid,
 p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $publish$
declare
 v_session public.world_sessions%rowtype;
 v_minutes public.world_session_minutes%rowtype;
 v_claim jsonb;
 v_op uuid;
 v_revision bigint;
 v_result jsonb;
 v_agenda jsonb;
 v_attendance jsonb;
begin
 if auth.uid() is null or p_session_id is null or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 select * into v_session from public.world_sessions where id=p_session_id for update;
 if v_session.id is null or not public.world_access_allowed(
    'world.minutes.publish',v_session.organization_id,null,
    v_session.organ_id,'session',p_session_id)
 then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
 v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.session.minutes.publish','R3',
    jsonb_build_object('sessionId',p_session_id,'subjectType','world_session_minutes'),
    jsonb_build_object('expectedRevision',p_expected_revision));
 v_op:=(v_claim->>'operationId')::uuid;
 if coalesce((v_claim->>'replayed')::boolean,false) then
   return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',true);
 end if;
 if v_session.status<>'concluded'
 then raise exception using errcode='23514',message='SESSION_NOT_CONCLUDED'; end if;
 select * into v_minutes from public.world_session_minutes
    where session_id=p_session_id for update;
 if v_minutes.session_id is null or v_minutes.status<>'in_review'
 then raise exception using errcode='23514',message='MINUTES_NOT_REVIEWED'; end if;
 if v_minutes.revision is distinct from p_expected_revision
 then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;

 -- Historical evidence is captured, not reused as ballot or quorum authority.
 select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'position',a.position,'title',a.title,'state',a.state)
    order by a.position),'[]'::jsonb) into v_agenda
 from public.world_agenda_items a
 where a.session_id=p_session_id and a.state<>'draft';
 select coalesce(jsonb_agg(jsonb_build_object(
    'countryId',a.country_id,'representationId',a.representation_id,
    'status',a.status,'proxyId',a.proxy_id,'recordedAt',a.recorded_at)
    order by a.country_id),'[]'::jsonb) into v_attendance
 from public.world_session_attendance a where a.session_id=p_session_id;
 update public.world_session_minutes
   set status='published',published_at=now(),
     revision=revision+1,updated_at=now()
   where session_id=p_session_id;
 v_revision:=v_minutes.revision+1;
 insert into public.world_session_minutes_revisions
  (session_id,revision,status,summary,body,actor_user_id,operation_id,
   agenda_snapshot,attendance_snapshot)
 values(p_session_id,v_revision,'published',v_minutes.summary,v_minutes.body,
    auth.uid(),v_op,v_agenda,v_attendance);
 perform private.v3_emit_domain_event(
   'world.session.minutes.published','world_session_minutes',p_session_id::text,
   v_revision,v_op,null,null,
   jsonb_build_object('sessionId',p_session_id,'revision',v_revision,
    'status','published'),1,array[]::text[]);
 v_result:=jsonb_build_object('ok',true,'sessionId',p_session_id,
    'revision',v_revision,'status','published','operationId',v_op);
 perform private.studio2_complete_operation(v_op,v_result);
 return public.studio2_reconcile_operation(v_op)||jsonb_build_object('replayed',false);
end
$publish$;

revoke all on function public.world_session_minutes_public_v1(uuid),
 public.world_session_minutes_manage_v1(uuid),
 public.world_save_session_minutes_v1(uuid,text,text,bigint,uuid,text,uuid),
 public.world_submit_session_minutes_v1(uuid,bigint,uuid,text,uuid),
 public.world_publish_session_minutes_v1(uuid,bigint,uuid,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_session_minutes_public_v1(uuid)
 to anon,authenticated,service_role;
grant execute on function public.world_session_minutes_manage_v1(uuid),
 public.world_save_session_minutes_v1(uuid,text,text,bigint,uuid,text,uuid),
 public.world_submit_session_minutes_v1(uuid,bigint,uuid,text,uuid),
 public.world_publish_session_minutes_v1(uuid,bigint,uuid,text,uuid)
 to authenticated,service_role;

do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
    'v3.tg6.world-session-minutes',1,'forward_fix_only',false,null,
    'Private draft and review, concluded-session publication, append-only minutes history, historical agenda/attendance evidence, scoped capabilities, CAS, receipted idempotent commands and publication-safe public read.'
  );
 end if;
end
$contract$;
commit;

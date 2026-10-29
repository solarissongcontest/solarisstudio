begin;
select public.v3_register_migration_contract('v3.integrity.durable-consequences',1,'forward_fix_only',false,null,'Observe immutable case/appeal history transactionally into S4, apply derived workflow consequences idempotently, and reconcile from canonical truth without re-adjudication.');

create index v3_integrity_history_consequence_order on public.integrity_adjudication_history(created_at,aggregate_type,aggregate_id,revision,id);

create table private.v3_integrity_consequence_applications (
 event_id uuid primary key references private.v3_domain_events(id) on delete restrict,
 history_id uuid not null unique references public.integrity_adjudication_history(id) on delete restrict,
 case_id uuid not null references public.integrity_cases(id) on delete restrict,
 source_revision bigint not null,
 result_metadata jsonb not null,
 applied_at timestamptz not null default now()
);
alter table private.v3_integrity_consequence_applications enable row level security;
revoke all on private.v3_integrity_consequence_applications from public,anon,authenticated,service_role;
create trigger v3_integrity_consequence_application_immutable before update or delete on private.v3_integrity_consequence_applications for each row execute function private.v3_reject_domain_event_receipt_mutation();

-- This bridge observes an already-authorized immutable fact. It never claims
-- the adjudication operation or authorizes a case/sanction mutation. The history
-- UUID is the stable observation identity; correlation retains the source op.
create function private.v3_enqueue_integrity_history(p_history_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $enqueue$
declare h public.integrity_adjudication_history%rowtype; r public.studio2_operation_receipts%rowtype; scope jsonb; fingerprint text;
begin
 select * into h from public.integrity_adjudication_history where id=p_history_id;
 if h.id is null then raise exception 'Immutable Integrity history not found' using errcode='P0002'; end if;
 scope:=jsonb_build_object('historyId',h.id,'caseId',h.case_id,'sourceOperationId',h.operation_id);
 fingerprint:=private.studio2_request_fingerprint('integrity.history.observe','R0',scope,'{}');
 insert into public.studio2_operation_receipts(operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at)
 values(h.id,h.actor_user_id,h.id::text,h.operation_id,fingerprint,'integrity.history.observe','R0',scope,'succeeded',jsonb_build_object('observedHistoryId',h.id),now()) on conflict(operation_id) do nothing;
 select * into r from public.studio2_operation_receipts where operation_id=h.id;
 if r.actor_id is distinct from h.actor_user_id or r.command<>'integrity.history.observe' or r.request_fingerprint is distinct from fingerprint or r.status<>'succeeded' then raise exception 'IDEMPOTENCY_CONFLICT: Integrity observation identity'; end if;
 return private.v3_emit_domain_event(h.event_type,'integrity_'||h.aggregate_type,h.aggregate_id::text,h.revision,h.id,null,null,
  jsonb_build_object('historyId',h.id,'caseId',h.case_id,'sourceOperationId',h.operation_id,'historyOccurredAt',h.created_at),1,array['integrity.workflow']);
end $enqueue$;
revoke all on function private.v3_enqueue_integrity_history(uuid) from public,anon,authenticated,service_role;

create function private.v3_integrity_history_consequence_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $history$
begin
 perform private.v3_enqueue_integrity_history(new.id);
 return new;
end $history$;
revoke all on function private.v3_integrity_history_consequence_trigger() from public,anon,authenticated,service_role;
create trigger v3_integrity_history_consequence after insert on public.integrity_adjudication_history for each row execute function private.v3_integrity_history_consequence_trigger();

-- Only derived tasks are written. Current case, appeal and sanction rows remain
-- canonical; an old event always re-reads current truth instead of replaying an
-- old status or re-applying an adjudication/sanction decision.
create function private.v3_apply_integrity_workflow(p_case_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $apply$
declare c public.integrity_cases%rowtype; a public.integrity_case_appeals%rowtype; state_text text; metadata jsonb;
begin
 select * into c from public.integrity_cases where id=p_case_id for share;
 if c.id is null then raise exception 'Integrity case not found' using errcode='P0002'; end if;
 state_text:=case when c.status like 'closed%' then 'resolved' when c.assigned_to is null then 'waiting' else 'open' end;
 insert into public.studio2_organizer_tasks as t(assigned_to,source_kind,source_id,source_key,task_type,required_capability,priority,state,title,description,href,resolution_predicate,opened_at,resolved_at,last_evaluated_at,updated_at)
 values(c.assigned_to,'integrity_case',c.id::text,'integrity_cases:'||c.id::text,'integrity.case.review','integrity.read',case c.priority when 'urgent' then 'critical' when 'high' then 'high' else 'normal' end,state_text,'Integrity case review','Review current canonical case state.','/admin/integrity-case/'||c.id::text,jsonb_build_object('table','integrity_cases','id',c.id,'field','status','resolvedWhen','closed*'),c.created_at,case when state_text='resolved' then now() end,now(),now())
 on conflict(source_key) do update set assigned_to=excluded.assigned_to,priority=excluded.priority,state=excluded.state,resolved_at=case when excluded.state='resolved' then coalesce(t.resolved_at,now()) else null end,resolution_predicate=excluded.resolution_predicate,last_evaluated_at=now(),updated_at=now()
 where (t.assigned_to,t.priority,t.state,t.resolution_predicate) is distinct from (excluded.assigned_to,excluded.priority,excluded.state,excluded.resolution_predicate);
 for a in select * from public.integrity_case_appeals where case_id=c.id order by id loop
  state_text:=case when a.status not in ('submitted','under_review') then 'resolved' when a.assigned_reviewer is null then 'waiting' else 'open' end;
  insert into public.studio2_organizer_tasks as t(assigned_to,source_kind,source_id,source_key,task_type,required_capability,priority,state,title,description,href,due_at,resolution_predicate,opened_at,resolved_at,last_evaluated_at,updated_at)
  values(a.assigned_reviewer,'integrity_appeal',a.id::text,'integrity_case_appeals:'||a.id::text,'integrity.appeal.review','integrity.read','high',state_text,'Integrity appeal review','Review current canonical appeal state.','/admin/integrity-appeals',a.deadline_at,jsonb_build_object('table','integrity_case_appeals','id',a.id,'field','status','resolvedWhen',jsonb_build_array('upheld','reduced','increased','overturned','rejected_late','rejected_ineligible')),a.submitted_at,case when state_text='resolved' then now() end,now(),now())
  on conflict(source_key) do update set assigned_to=excluded.assigned_to,state=excluded.state,due_at=excluded.due_at,resolved_at=case when excluded.state='resolved' then coalesce(t.resolved_at,now()) else null end,resolution_predicate=excluded.resolution_predicate,last_evaluated_at=now(),updated_at=now()
  where (t.assigned_to,t.state,t.due_at,t.resolution_predicate) is distinct from (excluded.assigned_to,excluded.state,excluded.due_at,excluded.resolution_predicate);
 end loop;
 metadata:=jsonb_build_object('caseId',c.id,'caseVersion',c.version,'caseStatus',c.status,
  'appealStateHash',(select md5(coalesce(jsonb_agg(jsonb_build_array(id,version,status,replacement_sanction_id) order by id)::text,'[]')) from public.integrity_case_appeals where case_id=c.id),
  'sanctionStateHash',(select md5(coalesce(jsonb_agg(jsonb_build_array(id,status,final_level,supersedes_sanction_id) order by id)::text,'[]')) from public.integrity_case_sanctions where case_id=c.id));
 return metadata;
end $apply$;
revoke all on function private.v3_apply_integrity_workflow(uuid) from public,anon,authenticated,service_role;

-- Explicit system authority: owner-only, pg_cron invokes this bounded derivation
-- from immutable history. No service-role payload or actor can invent truth.
-- The human wrapper below allows scoped, live-capability reconciliation too.
create function private.v3_reconcile_integrity_consequences(p_limit integer default 100,p_case_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $reconcile$
declare h record; d record; metadata jsonb; applied integer:=0; failed integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid Integrity reconciliation bound' using errcode='22023'; end if;
 -- Bounded adoption/recovery of historical facts. This never creates history.
 for h in select hist.id from public.integrity_adjudication_history hist where (p_case_id is null or hist.case_id=p_case_id) and not exists(select 1 from private.v3_domain_events e where e.operation_id=hist.id and e.event_type=hist.event_type) order by hist.created_at,hist.aggregate_type,hist.aggregate_id,hist.revision,hist.id limit p_limit loop
  perform private.v3_enqueue_integrity_history(h.id);
 end loop;
 -- An S4 delivery acknowledgement alone is not evidence that this consumer
 -- applied its work. Only our immutable application receipt is trusted here.
 for d in select o.event_id,hist.id as history_id,hist.case_id,hist.revision from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id join public.integrity_adjudication_history hist on hist.id=e.operation_id and hist.event_type=e.event_type and hist.aggregate_id::text=e.aggregate_id and hist.revision=e.aggregate_version
  where o.consumer_key='integrity.workflow' and (p_case_id is null or hist.case_id=p_case_id) and (o.available_at<=now() or p_case_id is not null) and not exists(select 1 from private.v3_integrity_consequence_applications a where a.event_id=o.event_id)
  order by hist.created_at,hist.aggregate_type,hist.aggregate_id,hist.revision,hist.id for update of o skip locked limit p_limit
 loop
  begin
   perform pg_advisory_xact_lock(hashtextextended('integrity-consequence:'||d.case_id::text,0));
   metadata:=private.v3_apply_integrity_workflow(d.case_id);
   insert into private.v3_integrity_consequence_applications(event_id,history_id,case_id,source_revision,result_metadata) values(d.event_id,d.history_id,d.case_id,d.revision,metadata);
   insert into private.v3_domain_event_consumer_receipts(event_id,consumer_key,result_metadata) values(d.event_id,'integrity.workflow',metadata) on conflict(event_id,consumer_key) do nothing;
   update private.v3_domain_event_outbox set status='completed',attempt_count=attempt_count+1,lease_owner=null,lease_expires_at=null,completed_at=now(),dead_lettered_at=null,last_error_code=null,last_error_metadata=null,updated_at=now() where event_id=d.event_id and consumer_key='integrity.workflow';
   applied:=applied+1;
  exception when others then
   -- This subtransaction rolls back tasks and receipts, not committed case
   -- truth. Retain a durable pending delivery for retry and scoped readback.
   update private.v3_domain_event_outbox set status='pending',attempt_count=attempt_count+1,lease_owner=null,lease_expires_at=null,completed_at=null,dead_lettered_at=null,available_at=now()+interval '1 minute',last_error_code='INTEGRITY_CONSEQUENCE_FAILED',last_error_metadata=jsonb_build_object('sqlState',sqlstate),updated_at=now() where event_id=d.event_id and consumer_key='integrity.workflow';
   failed:=failed+1;
  end;
 end loop;
 return jsonb_build_object('applied',applied,'failed',failed);
end $reconcile$;
revoke all on function private.v3_reconcile_integrity_consequences(integer,uuid) from public,anon,authenticated,service_role;

create function public.studio2_integrity_consequence_status(p_case_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $readback$
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'integrity.read',null) or not public.studio2_access_allowed('integrity.read',null,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 if not exists(select 1 from public.integrity_cases where id=p_case_id) then raise exception 'Integrity case not found' using errcode='P0002'; end if;
 return jsonb_build_object('caseId',p_case_id,'caseVersion',(select version from public.integrity_cases where id=p_case_id),'consequences',coalesce((select jsonb_agg(jsonb_build_object('historyId',h.id,'eventType',h.event_type,'revision',h.revision,'sourceOperationId',h.operation_id,'eventId',e.id,'status',case when a.event_id is not null then 'applied' else 'pending' end,'errorCode',o.last_error_code,'application',a.result_metadata) order by h.created_at,h.id) from public.integrity_adjudication_history h left join private.v3_domain_events e on e.operation_id=h.id and e.event_type=h.event_type left join private.v3_domain_event_outbox o on o.event_id=e.id and o.consumer_key='integrity.workflow' left join private.v3_integrity_consequence_applications a on a.event_id=e.id where h.case_id=p_case_id),'[]'::jsonb));
end $readback$;
revoke all on function public.studio2_integrity_consequence_status(uuid) from public,anon,service_role;
grant execute on function public.studio2_integrity_consequence_status(uuid) to authenticated;

create function public.studio2_reconcile_integrity_consequences(p_case_id uuid,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $human$
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'integrity.manage',null) or not public.studio2_access_allowed('integrity.manage',null,false) then raise exception 'AUTHORIZATION' using errcode='42501'; end if;
 if p_case_id is null or not exists(select 1 from public.integrity_cases where id=p_case_id) then raise exception 'Integrity case not found' using errcode='P0002'; end if;
 perform private.v3_reconcile_integrity_consequences(p_limit,p_case_id);
 return public.studio2_integrity_consequence_status(p_case_id);
end $human$;
revoke all on function public.studio2_reconcile_integrity_consequences(uuid,integer) from public,anon,service_role;
grant execute on function public.studio2_reconcile_integrity_consequences(uuid,integer) to authenticated;

select cron.schedule('v3-integrity-consequences','* * * * *','select private.v3_reconcile_integrity_consequences(100);');
commit;

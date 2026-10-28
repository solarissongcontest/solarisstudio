-- Disposable LOCAL-Supabase-only show/cue authority contract.
-- Caller must enforce the repository production-endpoint guard before psql.
-- All fixtures, privileged audit inspection and operations roll back.
begin;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27270000-0000-4000-8000-000000000001','authenticated','authenticated','show-owner@local.invalid',now(),now()),
 ('27270000-0000-4000-8000-000000000002','authenticated','authenticated','show-foreign@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27270000-0000-4000-8000-000000000011','27270000-0000-4000-8000-000000000001',now(),now()),
 ('27270000-0000-4000-8000-000000000012','27270000-0000-4000-8000-000000000002',now(),now());
insert into public.editions(id,name,year,slug,edition_number,status,published,theme_colors)
 values ('27270000-0000-4000-8000-000000000021','Show authority fixture',2026,'show-authority-fixture',272700,'active',false,'{}');
insert into public.studio2_capability_grants(user_id,capability,edition_id,granted_by) values
 ('27270000-0000-4000-8000-000000000001','edition.manage','27270000-0000-4000-8000-000000000021','27270000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000001","session_id":"27270000-0000-4000-8000-000000000011"}',true);
set local role authenticated;

-- Canonical create and exact replay.
select set_config('test.show_id',(public.v3_create_show(
  '27270000-0000-4000-8000-000000000021','Authority show','grand-final',1,'{}'::jsonb,
  'Create authority fixture','27270000-0000-4000-8000-000000000101','show-authority:create'
)->'show'->>'id'),true);
do $test$
declare v_retry jsonb;
begin
  v_retry := public.v3_create_show(
    '27270000-0000-4000-8000-000000000021','Authority show','grand-final',1,'{}'::jsonb,
    'Create authority fixture','27270000-0000-4000-8000-000000000101','show-authority:create');
  if v_retry->'show'->>'id' <> current_setting('test.show_id') then raise exception 'Create retry returned a different show'; end if;
  if (select count(*) from public.shows where edition_id='27270000-0000-4000-8000-000000000021') <> 1 then raise exception 'Create retry duplicated show state'; end if;
end $test$;

-- Authenticated clients cannot become peer lifecycle/runtime/cue writers.
do $test$
begin
  begin
    update public.shows set status='live' where id=current_setting('test.show_id')::uuid;
    raise exception 'Raw lifecycle UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.shows set broadcast_config=jsonb_set(coalesce(broadcast_config,'{}'::jsonb),'{showMode}','{"phase":"live"}'::jsonb,true)
      where id=current_setting('test.show_id')::uuid;
    raise exception 'Raw showMode UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.shows set broadcast_config=jsonb_set(coalesce(broadcast_config,'{}'::jsonb),'{studio2Rundown}','{"revision":99}'::jsonb,true)
      where id=current_setting('test.show_id')::uuid;
    raise exception 'Raw rundown UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $test$;

-- Start and exact lost-response replay must not advance twice.
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'scheduled',0,'live',now(),'',null,
  'Start reviewed authority show','27270000-0000-4000-8000-000000000111','show-authority:start');
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'scheduled',0,'live',now(),'',null,
  'Start reviewed authority show','27270000-0000-4000-8000-000000000111','show-authority:start');
do $test$
begin
  if (select status from public.shows where id=current_setting('test.show_id')::uuid) <> 'live' then raise exception 'Start did not commit lifecycle'; end if;
  if (select (broadcast_config->'showMode'->>'revision')::int from public.shows where id=current_setting('test.show_id')::uuid) <> 1 then raise exception 'Start retry advanced runtime twice'; end if;
  begin
    perform public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'scheduled',0,'ended',null,'',null,
      'Stale runtime fixture','27270000-0000-4000-8000-000000000112','show-authority:stale');
    raise exception 'Stale lifecycle/revision unexpectedly succeeded';
  exception when serialization_failure then null; end;
end $test$;

-- Audit/receipt tables are intentionally not caller-readable. Inspect them only as
-- the local test owner, then restore the authenticated actor before more RPC calls.
reset role;
do $test$
begin
  if (select count(*) from public.studio2_operation_receipts where operation_id='27270000-0000-4000-8000-000000000111') <> 1 then raise exception 'Start retry duplicated operation receipt'; end if;
  if (select count(*) from private.v3_domain_events where operation_id='27270000-0000-4000-8000-000000000111' and event_type='show.changed') <> 1 then raise exception 'Start retry duplicated show.changed'; end if;
  if has_table_privilege('authenticated','public.studio2_operation_receipts','SELECT') then raise exception 'Authenticated receipt inspection unexpectedly granted'; end if;
end $test$;
set local role authenticated;

-- Pause, resume, result subphase and terminal completion use one lifecycle authority.
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'live',1,'paused',now(),'',null,
  'Pause reviewed live show','27270000-0000-4000-8000-000000000113','show-authority:pause');
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'paused',2,'live',now(),'',null,
  'Resume reviewed live show','27270000-0000-4000-8000-000000000114','show-authority:resume');
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'live',3,'results_in_progress',now(),'',null,
  'Begin reviewed result segment','27270000-0000-4000-8000-000000000115','show-authority:results');
do $test$
begin
  if (select status from public.shows where id=current_setting('test.show_id')::uuid) <> 'live' then raise exception 'Results subphase became peer lifecycle state'; end if;
  if (select broadcast_config->'showMode'->>'phase' from public.shows where id=current_setting('test.show_id')::uuid) <> 'results_in_progress' then raise exception 'Result subphase missing'; end if;
end $test$;
select public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'live',4,'ended',now(),'',null,
  'Complete reviewed authority show','27270000-0000-4000-8000-000000000116','show-authority:end');
do $test$
begin
  begin
    perform public.v3_apply_show_runtime_change(current_setting('test.show_id')::uuid,'ended',5,'live',now(),'',null,
      'Illegal terminal rewind fixture','27270000-0000-4000-8000-000000000117','show-authority:illegal');
    raise exception 'Ended -> live unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null; end;
end $test$;

-- Cue configuration/execution shares one revision CAS and stable operation identity.
select public.v3_save_show_rundown(current_setting('test.show_id')::uuid,0,now(),
  '[{"id":"opening","label":"Opening","status":"planned","plannedDurationSeconds":60}]'::jsonb,
  'Configure authority rundown','27270000-0000-4000-8000-000000000121','show-cue:configure');
select public.v3_save_show_rundown(current_setting('test.show_id')::uuid,0,now(),
  '[{"id":"opening","label":"Opening","status":"planned","plannedDurationSeconds":60}]'::jsonb,
  'Configure authority rundown','27270000-0000-4000-8000-000000000121','show-cue:configure');
do $test$
begin
  if (select (broadcast_config->'studio2Rundown'->>'revision')::int from public.shows where id=current_setting('test.show_id')::uuid) <> 1 then raise exception 'Rundown retry advanced twice'; end if;
  begin
    perform public.v3_save_show_rundown(current_setting('test.show_id')::uuid,0,now(),
      '[{"id":"opening","label":"Changed","status":"planned","plannedDurationSeconds":60}]'::jsonb,
      'Stale rundown fixture','27270000-0000-4000-8000-000000000122','show-cue:stale');
    raise exception 'Stale rundown revision unexpectedly succeeded';
  exception when others then
    if sqlstate <> 'PT409' then raise; end if;
  end;
end $test$;
select public.v3_set_show_rundown_lock(current_setting('test.show_id')::uuid,1,true,'Lock authority rundown',
  '27270000-0000-4000-8000-000000000123','show-cue:lock');
select public.v3_transition_show_cue(current_setting('test.show_id')::uuid,2,'opening','ready','Ready authority cue',
  '27270000-0000-4000-8000-000000000124','show-cue:ready');
select public.v3_transition_show_cue(current_setting('test.show_id')::uuid,2,'opening','ready','Ready authority cue',
  '27270000-0000-4000-8000-000000000124','show-cue:ready');
do $test$
begin
  if (select (broadcast_config->'studio2Rundown'->>'revision')::int from public.shows where id=current_setting('test.show_id')::uuid) <> 3 then raise exception 'Cue retry advanced twice'; end if;
end $test$;
reset role;
do $test$
begin
  if (select count(*) from private.v3_domain_events where operation_id='27270000-0000-4000-8000-000000000124' and event_type='show.cue_changed') <> 1 then raise exception 'Cue retry duplicated show.cue_changed'; end if;
end $test$;
set local role authenticated;

-- A cue identifier cannot be used across show scope.
select set_config('test.other_show_id',(public.v3_create_show(
  '27270000-0000-4000-8000-000000000021','Other show','semi-final',2,'{}'::jsonb,
  'Create cross show fixture','27270000-0000-4000-8000-000000000131','show-authority:other-create'
)->'show'->>'id'),true);
select public.v3_save_show_rundown(current_setting('test.other_show_id')::uuid,0,now(),
  '[{"id":"other-cue","label":"Other cue","status":"planned","plannedDurationSeconds":60}]'::jsonb,
  'Configure other rundown','27270000-0000-4000-8000-000000000132','show-cue:other-configure');
do $test$
begin
  begin
    perform public.v3_transition_show_cue(current_setting('test.other_show_id')::uuid,1,'opening','ready','Cross show cue fixture',
      '27270000-0000-4000-8000-000000000133','show-cue:cross-show');
    raise exception 'Foreign-show cue id unexpectedly succeeded';
  exception when no_data_found then null; end;
end $test$;

-- Authenticated actor without edition capability cannot operate either authority.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000002","session_id":"27270000-0000-4000-8000-000000000012"}',true);
do $test$
begin
  begin
    perform public.v3_apply_show_runtime_change(current_setting('test.other_show_id')::uuid,'scheduled',0,'live',now(),'',null,
      'Foreign actor runtime fixture','27270000-0000-4000-8000-000000000134','show-authority:foreign');
    raise exception 'Foreign actor runtime mutation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.v3_set_show_rundown_lock(current_setting('test.other_show_id')::uuid,1,true,'Foreign actor lock fixture',
      '27270000-0000-4000-8000-000000000135','show-cue:foreign-lock');
    raise exception 'Foreign actor cue lock unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $test$;

-- Setup-only deletion is replayable after the row is gone, but durable-history show deletion is denied.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000001","session_id":"27270000-0000-4000-8000-000000000011"}',true);
select set_config('test.delete_show_id',(public.v3_create_show(
  '27270000-0000-4000-8000-000000000021','Delete fixture','special',3,'{}'::jsonb,
  'Create delete fixture','27270000-0000-4000-8000-000000000141','show-authority:delete-create'
)->'show'->>'id'),true);
select public.v3_delete_show(current_setting('test.delete_show_id')::uuid,'Delete fixture','special',3,'Delete setup only fixture',
  '27270000-0000-4000-8000-000000000142','show-authority:delete');
select public.v3_delete_show(current_setting('test.delete_show_id')::uuid,'Delete fixture','special',3,'Delete setup only fixture',
  '27270000-0000-4000-8000-000000000142','show-authority:delete');
do $test$
begin
  if exists(select 1 from public.shows where id=current_setting('test.delete_show_id')::uuid) then raise exception 'Setup-only show still exists'; end if;
  begin
    perform public.v3_delete_show(current_setting('test.show_id')::uuid,'Authority show','grand-final',1,'Cannot erase durable history',
      '27270000-0000-4000-8000-000000000143','show-authority:delete-history');
    raise exception 'History-bearing deletion unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null; end;
end $test$;

-- Final database authority proof runs as the local test owner, not an API role.
reset role;
do $test$
begin
  if has_table_privilege('authenticated','public.shows','INSERT') then raise exception 'Authenticated raw INSERT remains granted'; end if;
  if has_table_privilege('authenticated','public.shows','DELETE') then raise exception 'Authenticated raw DELETE remains granted'; end if;
  if has_table_privilege('service_role','public.shows','UPDATE') then raise exception 'Service role raw UPDATE remains granted'; end if;
  if has_column_privilege('authenticated','public.shows','status','UPDATE') then raise exception 'Authenticated lifecycle UPDATE remains granted'; end if;
  if not has_column_privilege('authenticated','public.shows','broadcast_config','UPDATE') then raise exception 'Bounded presentation compatibility grant missing'; end if;
  if has_function_privilege('anon','public.v3_apply_show_runtime_change(uuid,text,integer,text,timestamptz,text,text,text,uuid,text)','EXECUTE') then raise exception 'Anonymous runtime command execution'; end if;
  if has_function_privilege('service_role','public.v3_apply_show_runtime_change(uuid,text,integer,text,timestamptz,text,text,text,uuid,text)','EXECUTE') then raise exception 'Unbound service-role runtime execution'; end if;
  if has_function_privilege('service_role','public.v3_transition_show_cue(uuid,integer,text,text,text,uuid,text)','EXECUTE') then raise exception 'Unbound service-role cue execution'; end if;
  if has_function_privilege('authenticated','public.studio2_transition_broadcast_segment(uuid,integer,text,text,text)','EXECUTE') then raise exception 'Legacy cue peer RPC remains executable'; end if;
end $test$;

rollback;

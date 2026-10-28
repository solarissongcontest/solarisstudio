-- Disposable LOCAL-Supabase-only lock semantics contract.
-- Locks freeze rundown structure for editors, but they are not ownership leases over
-- live execution. Any broadcaster-authorized operator may release a lock, and cue
-- execution continues to use revision CAS while the structural lock is held.
begin;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27271000-0000-4000-8000-000000000001','authenticated','authenticated','lock-a@local.invalid',now(),now()),
 ('27271000-0000-4000-8000-000000000002','authenticated','authenticated','lock-b@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27271000-0000-4000-8000-000000000011','27271000-0000-4000-8000-000000000001',now(),now()),
 ('27271000-0000-4000-8000-000000000012','27271000-0000-4000-8000-000000000002',now(),now());
insert into public.editions(id,name,year,slug,edition_number,status,published,theme_colors)
 values ('27271000-0000-4000-8000-000000000021','Show lock fixture',2026,'show-lock-fixture',272710,'active',false,'{}');
insert into public.studio2_capability_grants(user_id,capability,edition_id,granted_by) values
 ('27271000-0000-4000-8000-000000000001','edition.manage','27271000-0000-4000-8000-000000000021','27271000-0000-4000-8000-000000000001'),
 ('27271000-0000-4000-8000-000000000002','edition.manage','27271000-0000-4000-8000-000000000021','27271000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"27271000-0000-4000-8000-000000000001","session_id":"27271000-0000-4000-8000-000000000011"}',true);
set local role authenticated;

select set_config('test.lock_show_id',(public.v3_create_show(
  '27271000-0000-4000-8000-000000000021','Lock authority show','special',1,'{}'::jsonb,
  'Create lock authority fixture','27271000-0000-4000-8000-000000000101','show-lock:create'
)->'show'->>'id'),true);
select public.v3_save_show_rundown(current_setting('test.lock_show_id')::uuid,0,now(),
  '[{"id":"opening","label":"Opening","status":"planned","plannedDurationSeconds":60}]'::jsonb,
  'Configure lock authority rundown','27271000-0000-4000-8000-000000000102','show-lock:configure');
select public.v3_set_show_rundown_lock(current_setting('test.lock_show_id')::uuid,1,true,'Freeze reviewed rundown structure',
  '27271000-0000-4000-8000-000000000103','show-lock:acquire');

do $test$
begin
  if (select broadcast_config->'studio2Rundown'->>'lockedBy' from public.shows where id=current_setting('test.lock_show_id')::uuid)
       <> '27271000-0000-4000-8000-000000000001' then raise exception 'Lock did not record acquiring operator'; end if;
  begin
    perform public.v3_save_show_rundown(current_setting('test.lock_show_id')::uuid,2,now(),
      '[{"id":"opening","label":"Edited while locked","status":"planned","plannedDurationSeconds":60}]'::jsonb,
      'Attempt structural edit while locked','27271000-0000-4000-8000-000000000104','show-lock:edit-blocked');
    raise exception 'Structural edit unexpectedly succeeded while rundown locked';
  exception when object_not_in_prerequisite_state then null; end;
end $test$;

-- Operator B is equally authorized, but a stale revision cannot release the lock.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27271000-0000-4000-8000-000000000002","session_id":"27271000-0000-4000-8000-000000000012"}',true);
do $test$
begin
  begin
    perform public.v3_set_show_rundown_lock(current_setting('test.lock_show_id')::uuid,1,false,'Stale collaborative unlock attempt',
      '27271000-0000-4000-8000-000000000105','show-lock:stale-unlock');
    raise exception 'Stale unlock unexpectedly succeeded';
  exception when others then
    if sqlstate <> 'PT409' then raise; end if;
  end;
end $test$;

-- Structural lock is advisory for editing only. Live cue execution remains available
-- and CAS-governed, so an editor lock cannot freeze a live show.
select public.v3_transition_show_cue(current_setting('test.lock_show_id')::uuid,2,'opening','ready','Ready cue while structure locked',
  '27271000-0000-4000-8000-000000000106','show-lock:ready');
select public.v3_transition_show_cue(current_setting('test.lock_show_id')::uuid,3,'opening','live','Execute cue while structure locked',
  '27271000-0000-4000-8000-000000000107','show-lock:live');
do $test$
begin
  if (select broadcast_config->'studio2Rundown'->>'lockedAt' from public.shows where id=current_setting('test.lock_show_id')::uuid) is null then raise exception 'Cue execution unexpectedly cleared structural lock'; end if;
  if (select broadcast_config->'studio2Rundown'->'segments'->0->>'status' from public.shows where id=current_setting('test.lock_show_id')::uuid) <> 'live' then raise exception 'Cue execution was incorrectly blocked by structural lock'; end if;
end $test$;

-- Any currently authorized broadcast operator may clear a structural lock. This is
-- deliberate recovery: an abandoned browser/session cannot create an immortal lock.
select public.v3_set_show_rundown_lock(current_setting('test.lock_show_id')::uuid,4,false,'Collaborative stale-lock recovery',
  '27271000-0000-4000-8000-000000000108','show-lock:release');
do $test$
begin
  if (select broadcast_config->'studio2Rundown'->>'lockedAt' from public.shows where id=current_setting('test.lock_show_id')::uuid) is not null then raise exception 'Authorized collaborative unlock did not clear lock'; end if;
  if (select (broadcast_config->'studio2Rundown'->>'revision')::int from public.shows where id=current_setting('test.lock_show_id')::uuid) <> 5 then raise exception 'Lock/cue revision sequence is not monotonic'; end if;
end $test$;

-- Persisted event evidence is private; inspect it only as the disposable test owner.
reset role;
do $test$
begin
  if (select count(*) from private.v3_domain_events where operation_id in (
      '27271000-0000-4000-8000-000000000103','27271000-0000-4000-8000-000000000108'
    ) and event_type='show.cue_changed') <> 2 then raise exception 'Lock lifecycle did not emit exactly one event per committed lock change'; end if;
end $test$;

rollback;

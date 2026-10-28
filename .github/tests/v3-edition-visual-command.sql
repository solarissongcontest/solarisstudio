-- Disposable local-only transaction; no persisted fixture state.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27180000-0000-4000-8000-000000000001','authenticated','authenticated','visual-owner@local.invalid',now(),now()),
 ('27180000-0000-4000-8000-000000000002','authenticated','authenticated','visual-other@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27180000-0000-4000-8000-000000000011','27180000-0000-4000-8000-000000000001',now(),now()),
 ('27180000-0000-4000-8000-000000000012','27180000-0000-4000-8000-000000000002',now(),now());
insert into public.user_roles(user_id,role) values ('27180000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,year,slug,edition_number,status,published,theme_colors)
 values ('27180000-0000-4000-8000-000000000021','Visual fixture',2026,'visual-fixture',271800,'active',false,'{}');
insert into public.studio2_capability_grants(user_id,capability,edition_id,granted_by) values ('27180000-0000-4000-8000-000000000001','edition.manage','27180000-0000-4000-8000-000000000021','27180000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27180000-0000-4000-8000-000000000001","session_id":"27180000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select public.v3_apply_edition_visual_change('27180000-0000-4000-8000-000000000021','{"theme_colors":{}}','{"theme_colors":{"publicRadius":20}}','Reviewed public design fixture');
-- Exact retry replays rather than rejecting the now-stale comparison.
select public.v3_apply_edition_visual_change('27180000-0000-4000-8000-000000000021','{"theme_colors":{}}','{"theme_colors":{"publicRadius":20}}','Reviewed public design fixture');
do $test$
begin
  begin
    perform public.v3_apply_edition_visual_change('27180000-0000-4000-8000-000000000021','{"theme_colors":{}}','{"theme_colors":{"publicRadius":25}}','Conflicting concurrent change');
    raise exception 'Stale visual comparison unexpectedly succeeded';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.v3_apply_edition_visual_change('27180000-0000-4000-8000-000000000021','{"published":false}','{"published":true}','Cannot change publication');
    raise exception 'Unsupported mutation unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
end
$test$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27180000-0000-4000-8000-000000000002","session_id":"27180000-0000-4000-8000-000000000012"}',true);
do $test$
begin
  begin
    perform public.v3_apply_edition_visual_change('27180000-0000-4000-8000-000000000021','{"theme_colors":{"publicRadius":20}}','{"theme_colors":{}}','Unauthorized actor fixture');
    raise exception 'Foreign actor unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end
$test$;
reset role;
do $test$
begin
 if (select count(*) from public.studio2_operation_receipts where command='edition.visual.change' and scope->>'editionId'='27180000-0000-4000-8000-000000000021') <> 1 then raise exception 'Retry or rejected operation duplicated receipts'; end if;
 if (select count(*) from private.v3_domain_events where event_type='edition.changed' and edition_id='27180000-0000-4000-8000-000000000021') <> 1 then raise exception 'Event persistence is not atomic/idempotent'; end if;
 if has_function_privilege('anon','public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)','EXECUTE') then raise exception 'Anonymous command execution'; end if;
 if has_function_privilege('service_role','public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)','EXECUTE') then raise exception 'Unbound service-role command execution'; end if;
end
$test$;
rollback;

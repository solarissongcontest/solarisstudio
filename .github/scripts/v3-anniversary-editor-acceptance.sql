\set ON_ERROR_STOP on
begin;
do $acceptance$
declare
  v_edition uuid := gen_random_uuid();
  v_other_edition uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_reader uuid := gen_random_uuid();
  v_execution uuid := gen_random_uuid();
  v_denied uuid := gen_random_uuid();
  v_result jsonb;
  v_retry jsonb;
  v_revision bigint;
  v_public jsonb;
  v_count integer;
  v_item uuid;
  i integer;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_actor,'authenticated','authenticated',v_actor::text||'@anniversary.local.invalid',now(),now()),
        (v_reader,'authenticated','authenticated',v_reader::text||'@anniversary.local.invalid',now(),now());
  insert into public.editions(id,name,slug,status,published)
  values(v_edition,'Isolated Anniversary acceptance','anniversary-'||v_edition,'active',true),
        (v_other_edition,'Foreign Anniversary scope','anniversary-'||v_other_edition,'draft',false);
  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values(v_actor,'story.manage',v_edition),(v_reader,'story.read',v_edition);

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  set local role authenticated;
  v_result := public.studio2_execute_story_operation(
    v_edition,'generate_storyline','Isolated editorial acceptance',v_execution,null,null,
    '{"title":"Anniversary editorial acceptance","introduction":"A synthetic isolated editorial timeline."}'::jsonb);
  v_revision := (v_result->>'revision')::bigint;
  if v_revision is null or v_revision < 1 or v_result->>'executionId' is distinct from v_execution::text or v_result->>'editionId' is distinct from v_edition::text then
    raise exception 'Generation lacks exact-edition authoritative revision';
  end if;
  v_retry := public.studio2_execute_story_operation(
    v_edition,'generate_storyline','Isolated editorial acceptance',v_execution,null,null,
    '{"title":"Anniversary editorial acceptance","introduction":"A synthetic isolated editorial timeline."}'::jsonb);
  if v_retry->>'idempotentReplay' is distinct from 'true' or v_retry->>'revision' is distinct from v_result->>'revision' or v_retry->>'executionId' is distinct from v_execution::text then
    raise exception 'Exact retry did not replay the durable execution';
  end if;

  for i in 1..4 loop
    v_result := public.studio2_execute_story_operation(
      v_edition,'create_manual_item','Isolated reviewed milestone',gen_random_uuid(),v_revision,null,
      jsonb_build_object('headline','Milestone '||i,'summary','Synthetic reviewed Anniversary milestone',
                        'importance',70,'included',true));
    v_revision := (v_result->>'revision')::bigint;
  end loop;
  v_item := (v_result->>'itemId')::uuid;
  v_result := public.studio2_execute_story_operation(
    v_edition,'update_item','Exclude reviewed milestone while preserving its history',
    gen_random_uuid(),v_revision,v_item,
    '{"headline":"Excluded reviewed milestone","included":false}'::jsonb);
  v_revision := (v_result->>'revision')::bigint;
  begin
    perform public.studio2_execute_story_operation(
      v_edition,'create_manual_item','Reject stale reviewed milestone',v_denied,v_revision-1,null,
      '{"headline":"Stale milestone","summary":"Must not be persisted","importance":70}'::jsonb);
    raise exception 'Stale command unexpectedly succeeded';
  exception when serialization_failure or sqlstate 'PT409' then null;
  end;
  begin
    perform public.studio2_execute_story_operation(
      v_other_edition,'generate_storyline','Reject cross-edition mutation',v_denied,null,null,'{}'::jsonb);
    raise exception 'Cross-edition command unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reader,'role','authenticated')::text,true);
  -- A read capability must never become mutation authority.
  perform public.studio2_storytelling_snapshot(v_edition);
  begin
    perform public.studio2_execute_story_operation(
      v_edition,'publish_storyline','Reject read-only publication',v_denied,v_revision,null,'{}'::jsonb);
    raise exception 'Read-only actor published Anniversary content';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select count(*) into v_count from public.studio2_story_operation_executions where execution_id=v_denied;
  if v_count <> 0 then raise exception 'Rejected action emitted a successful execution'; end if;
  select count(*) into v_count from public.studio2_story_operation_executions where execution_id=v_execution;
  if v_count <> 1 then raise exception 'Exact retry duplicated execution evidence'; end if;
  select count(*) into v_count from public.studio2_storyline_items where edition_id=v_edition and manual_override;
  if v_count <> 4 then raise exception 'Rejected action altered milestone count'; end if;
  if not exists(select 1 from public.studio2_storyline_items
                where id=v_item and not included and headline='Excluded reviewed milestone') then
    raise exception 'Canonical milestone edit did not preserve excluded history';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  set local role authenticated;
  v_result := public.studio2_execute_story_operation(
    v_edition,'publish_storyline','Publish reviewed Anniversary timeline',gen_random_uuid(),v_revision,null,'{}'::jsonb);
  if v_result->>'status' is distinct from 'published' then raise exception 'Canonical publication failed'; end if;
  v_public := public.studio2_public_storyline('anniversary-'||v_edition);
  if v_public is null then raise exception 'Published Anniversary timeline has no public readback'; end if;
  if exists(select 1 from jsonb_array_elements(v_public->'items') item where item->>'id'=v_item::text) then
    raise exception 'Excluded milestone leaked through public readback';
  end if;
  v_result := public.studio2_execute_story_operation(
    v_edition,'unpublish_storyline','Unpublish reviewed Anniversary timeline',gen_random_uuid(),
    (v_result->>'revision')::bigint,null,'{}'::jsonb);
  if v_result->>'status' is distinct from 'draft' then raise exception 'Canonical unpublication failed'; end if;
  v_public := public.studio2_public_storyline('anniversary-'||v_edition);
  if v_public is not null then raise exception 'Unpublished timeline leaked through public readback'; end if;
  reset role;

  delete from public.studio2_capability_grants where user_id=v_actor;
  set local role authenticated;
  begin
    perform public.studio2_execute_story_operation(
      v_edition,'publish_storyline','Reject revoked editorial authority',v_denied,null,null,'{}'::jsonb);
    raise exception 'Revoked actor retained editorial authority';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  begin
    perform public.studio2_execute_story_operation(
      v_edition,'publish_storyline','Reject anonymous publication',v_denied,null,null,'{}'::jsonb);
    raise exception 'Anonymous actor obtained editorial mutation authority';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: governed Anniversary lifecycle, reviewed edit/exclusion, exact retry, stale/cross-edition/read-only/revoked/anonymous denial and publication readback';
end
$acceptance$;
rollback;

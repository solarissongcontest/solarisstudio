\set ON_ERROR_STOP on
-- Executed only by the S16 disposable local Supabase workflow.
-- This test is NOT a general editions-table DML cutover: other legacy
-- edition writers remain and must be removed independently.
begin;
do $acceptance$
declare
  v_actor uuid:=gen_random_uuid();
  v_denied uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
  v_edition uuid:=gen_random_uuid();
  v_foreign uuid:=gen_random_uuid();
  v_revision bigint;
  v_expected jsonb;
  v_patch jsonb:='{"theme_colors":{"publicStyle":"editorial","publicRadius":0}}';
  v_result jsonb;
  v_replay jsonb;
  v_operation uuid;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_actor,'authenticated','authenticated',v_actor||'@visual.local.invalid',now(),now()),
        (v_denied,'authenticated','authenticated',v_denied||'@visual.local.invalid',now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at)
  values(v_session,v_actor,now(),now());
  insert into public.editions(id,name,slug,status,published,theme_colors)
  values(v_edition,'Visual acceptance','visual-'||v_edition,'draft',false,'{}'::jsonb),
        (v_foreign,'Other visual acceptance','visual-'||v_foreign,'draft',false,'{}'::jsonb);
  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values(v_actor,'edition.manage',v_edition);

  select data_revision into v_revision from public.editions where id=v_edition;
  select jsonb_build_object(
    'data_revision',data_revision,'name',name,'slug',slug,
    'theme_colors',theme_colors
  ) into v_expected from public.editions where id=v_edition;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_actor,'role','authenticated','session_id',v_session)::text,true);
  set local role authenticated;
  v_result:=public.v3_apply_edition_visual_change(
    v_edition,v_expected,v_patch,'Reviewed edition public page design');
  if v_result->>'ok' is distinct from 'true'
    or v_result->'edition'->>'id' is distinct from v_edition::text
    or (v_result->'edition'->>'data_revision')::bigint <= v_revision
    or v_result->'edition'->'theme_colors' is distinct from (v_patch->'theme_colors') then
    raise exception 'Governed edition visual receipt/readback mismatch';
  end if;
  v_operation:=(v_result->>'operationId')::uuid;

  v_replay:=public.v3_apply_edition_visual_change(
    v_edition,v_expected,v_patch,'Reviewed edition public page design');
  if v_replay->>'replayed' is distinct from 'true'
    or v_replay->>'operationId' is distinct from v_result->>'operationId' then
    raise exception 'Exact visual retry failed to replay original receipt';
  end if;

  begin
    perform public.v3_apply_edition_visual_change(
      v_edition,v_expected,'{"theme_colors":{"publicStyle":"glass"}}',
      'Try a stale public visual overwrite');
    raise exception 'Stale visual compare-and-swap succeeded';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.v3_apply_edition_visual_change(
      v_foreign,jsonb_build_object(
        'data_revision',0,'name','Other visual acceptance',
        'slug','visual-'||v_foreign,'theme_colors','{}'::jsonb
      ),v_patch,'Try foreign edition visual mutation');
    raise exception 'Cross-edition visual mutation succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.v3_apply_edition_visual_change(
      v_edition,v_expected,'{"logo":"https://example.invalid/unverified.png"}',
      'Try unverified Storage asset injection');
    raise exception 'Visual authority permitted arbitrary artwork/logo bytes';
  exception when invalid_parameter_value then null;
  end;
  reset role;

  if (select count(*) from public.studio2_operation_receipts
      where operation_id=v_operation and status='succeeded') <> 1
    or (select count(*) from private.v3_domain_events where operation_id=v_operation) <> 1 then
    raise exception 'Visual retry duplicated or omitted durable receipt/domain event';
  end if;

  delete from public.studio2_capability_grants
  where user_id=v_actor and edition_id=v_edition;
  set local role authenticated;
  begin
    perform public.v3_apply_edition_visual_change(
      v_edition,v_expected,v_patch,'Reviewed edition public page design');
    raise exception 'Revoked actor replayed an official visual command';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  begin
    perform public.v3_apply_edition_visual_change(
      v_edition,v_expected,v_patch,'Reject anonymous visual mutation');
    raise exception 'Anonymous actor obtained visual mutation authority';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if has_function_privilege('anon',
       'public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)','EXECUTE')
    or has_function_privilege('service_role',
       'public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)','EXECUTE') then
    raise exception 'Visual RPC exposed beyond authenticated actor boundary';
  end if;
  raise notice 'PASS: S16 edition public design live-session, scope, CAS, replay, receipt, Storage boundary, revocation and anon/service denial';
end
$acceptance$;
rollback;

\set ON_ERROR_STOP on
begin;
do $acceptance$
declare
  v_actor uuid:=gen_random_uuid();
  v_reader uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
  v_edition uuid:=gen_random_uuid();
  v_foreign uuid:=gen_random_uuid();
  v_result jsonb;
  v_retry jsonb;
  v_revision bigint;
  v_operation uuid;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_actor,'authenticated','authenticated',v_actor||'@metadata.local.invalid',now(),now()),
        (v_reader,'authenticated','authenticated',v_reader||'@metadata.local.invalid',now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(v_session,v_actor,now(),now());
  insert into public.editions(id,name,slug,status,published)
  values(v_edition,'Historical metadata acceptance','metadata-'||v_edition,'ended',true),
        (v_foreign,'Foreign metadata scope','metadata-'||v_foreign,'draft',false);
  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values(v_actor,'edition.manage',v_edition),(v_reader,'edition.read',v_edition);
  select data_revision into v_revision from public.editions where id=v_edition;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated','session_id',v_session)::text,true);
  set local role authenticated;
  v_result:=public.v3_apply_edition_metadata_change(v_edition,v_revision,
    '{"event_date":"2026-09-16","year":2026}', 'Reviewed isolated historical date');
  if v_result->>'ok' is distinct from 'true' or v_result->'edition'->>'id' is distinct from v_edition::text
    or (v_result->'edition'->>'data_revision')::bigint <= v_revision
    or v_result->'edition'->>'event_date' is distinct from '2026-09-16' then
    raise exception 'Canonical historical date receipt/readback mismatch';
  end if;
  v_operation:=(v_result->>'operationId')::uuid;
  v_retry:=public.v3_apply_edition_metadata_change(v_edition,v_revision,
    '{"event_date":"2026-09-16","year":2026}', 'Reviewed isolated historical date');
  if v_retry->>'replayed' is distinct from 'true' or v_retry->>'operationId' is distinct from v_result->>'operationId' then
    raise exception 'Historical date retry did not replay the committed receipt';
  end if;
  begin
    perform public.v3_apply_edition_metadata_change(v_edition,v_revision,
      '{"event_date":"2026-09-15","year":2026}', 'Reject stale historical date');
    raise exception 'Stale historical date overwrote newer state';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.v3_apply_edition_metadata_change(v_foreign,0,'{"year":2026}', 'Reject foreign edition');
    raise exception 'Cross-edition metadata command unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.v3_apply_edition_metadata_change(v_edition,
      (v_result->'edition'->>'data_revision')::bigint,'{"published":false}', 'Reject publication authority crossover');
    raise exception 'Metadata command accepted publication state';
  exception when invalid_parameter_value then null;
  end;
  reset role;
  begin
    insert into public.studio2_contest_events(edition_id,type,entity_type,entity_id,payload)
    values(v_edition,'unknown.unregistered_metadata_event','edition',v_edition::text,'{}');
    raise exception 'Metadata command weakened the existing event vocabulary';
  exception when check_violation then null;
  end;
  if (select count(*) from public.studio2_operation_receipts where operation_id=v_operation and status='succeeded')<>1
    or (select count(*) from private.v3_domain_events where operation_id=v_operation)<>1 then
    raise exception 'Metadata retry duplicated or omitted durable receipt/event';
  end if;
  if (select event_date::text from public.editions where id=v_edition) is distinct from '2026-09-16' then
    raise exception 'Denied command changed historical date';
  end if;
  -- Permission revocation is checked before accepting a replay too.
  delete from public.studio2_capability_grants where user_id=v_actor;
  set local role authenticated;
  begin
    perform public.v3_apply_edition_metadata_change(v_edition,v_revision,
      '{"event_date":"2026-09-16","year":2026}', 'Reviewed isolated historical date');
    raise exception 'Revoked actor replayed a protected receipt';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform public.v3_apply_edition_metadata_change(v_edition,v_revision,'{"year":2026}', 'Reject anonymous date change');
    raise exception 'Anonymous actor obtained metadata authority';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: edition metadata CAS, exact replay, receipt/event atomicity, cross-edition/revoked/anonymous denial and publication boundary';
end
$acceptance$;
rollback;

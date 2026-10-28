begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('28122900-0000-4000-8000-000000000001','authenticated','authenticated','intake-delegation@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('28122900-0000-4000-8000-000000000011','28122900-0000-4000-8000-000000000001',now(),now());
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28122900-0000-4000-8000-000000000001","session_id":"28122900-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $protected$
declare
  v_first jsonb;
  v_retry jsonb;
  v_compat jsonb;
begin
  v_first := public.v3_create_protected_integrity_case(
    '28122900-0000-4000-8000-000000000101',repeat('a',64),'confidential','report','conduct',
    'Canonical delegation regression','Concrete protected case details for authority regression.');
  v_retry := public.v3_create_protected_integrity_case(
    '28122900-0000-4000-8000-000000000101',repeat('a',64),'confidential','report','conduct',
    'Canonical delegation regression','Concrete protected case details for authority regression.');
  if v_first->>'case_id' is null or v_retry->>'case_id' is distinct from v_first->>'case_id'
     or v_retry->>'replayed' <> 'true' then
    raise exception 'Protected intake did not reconcile one canonical case';
  end if;
  v_compat := public.create_protected_integrity_case('confidential','report','conduct',
    'Legacy delegation regression','Concrete compatibility case details for authority regression.');
  if v_compat->>'case_id' is null then raise exception 'Protected compatibility delegation failed'; end if;
end
$protected$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $anonymous$
declare
  v_first jsonb;
  v_retry jsonb;
  v_compat jsonb;
begin
  v_first := public.v3_public_create_anonymous_integrity_case(
    '28122900-0000-4000-8000-000000000102',repeat('b',64),'conduct',
    'Anonymous delegation regression','Concrete anonymous case details for authority regression.');
  v_retry := public.v3_public_create_anonymous_integrity_case(
    '28122900-0000-4000-8000-000000000102',repeat('b',64),'conduct',
    'Anonymous delegation regression','Concrete anonymous case details for authority regression.');
  if v_first->>'case_id' is null or v_retry->>'case_id' is distinct from v_first->>'case_id'
     or v_retry->>'recovery_key' is distinct from v_first->>'recovery_key'
     or v_retry->>'replayed' <> 'true' then
    raise exception 'Anonymous intake did not reconcile canonical case and recovery credential';
  end if;
  v_compat := public.public_create_anonymous_integrity_case('conduct',
    'Anonymous legacy delegation','Concrete anonymous compatibility details for authority regression.');
  if v_compat->>'case_id' is null then raise exception 'Anonymous compatibility delegation failed'; end if;
end
$anonymous$;
reset role;
do $evidence$
begin
  if (select count(*) from public.integrity_cases where summary in (
      'Canonical delegation regression','Legacy delegation regression',
      'Anonymous delegation regression','Anonymous legacy delegation')) <> 4 then
    raise exception 'Intake retries or delegation created missing/duplicate cases';
  end if;
  if not exists(select 1 from public.integrity_case_events
      where event_type='integrity.case_changed' and operation_id='28122900-0000-4000-8000-000000000101') then
    raise exception 'Protected intake lost canonical event provenance';
  end if;
  if (select count(*) from public.integrity_adjudication_history
      where operation_id='28122900-0000-4000-8000-000000000101' and event_type='integrity.case_changed') <> 1 then
    raise exception 'Protected intake retry lost or duplicated immutable adjudication history';
  end if;
  if has_function_privilege('authenticated','public.create_protected_integrity_case_impl(text,text,text,text,text,text,text,text[],text)','EXECUTE')
     or has_function_privilege('anon','public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text)','EXECUTE') then
    raise exception 'Direct internal intake writer remains callable';
  end if;
end
$evidence$;
rollback;

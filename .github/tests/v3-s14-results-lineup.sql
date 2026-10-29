-- Disposable local database only. All fixture and operation effects roll back.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('25000000-0000-4000-8000-000000000801','authenticated','authenticated','results-lineup@local.invalid',now(),now());
set local request.jwt.claim.sub='25000000-0000-4000-8000-000000000801';
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role","sub":"25000000-0000-4000-8000-000000000801"}';
insert into public.countries(id,name,short_code) values
 ('25000000-0000-4000-8000-000000000811','Current','LC1'),
 ('25000000-0000-4000-8000-000000000812','Withdrawn','LC2'),
 ('25000000-0000-4000-8000-000000000813','Disqualified','LC3');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('25000000-0000-4000-8000-000000000820','Results lineup regression',2026,'results-lineup-regression',25820,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
values ('25000000-0000-4000-8000-000000000821','25000000-0000-4000-8000-000000000820','Lineup final','final',1,false,
 '{"juryEnabled":false,"televoteEnabled":false}');
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order,participation_status)
select '25000000-0000-4000-8000-000000000820','25000000-0000-4000-8000-000000000821',id,name,name,
 row_number() over(order by id),'confirmed'
from public.countries where id in ('25000000-0000-4000-8000-000000000811','25000000-0000-4000-8000-000000000812','25000000-0000-4000-8000-000000000813');

do $test$
declare
  v_show uuid := '25000000-0000-4000-8000-000000000821';
  v_edition uuid := '25000000-0000-4000-8000-000000000820';
  v_country uuid;
  v_status text;
  v_preview jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_version bigint;
  v_current_id uuid;
  v_execution uuid := '25000000-0000-4000-8000-000000000831';
begin
  select id into strict v_current_id from public.results
  where show_id=v_show and country_id='25000000-0000-4000-8000-000000000811';
  for v_country,v_status in values
    ('25000000-0000-4000-8000-000000000812'::uuid,'withdrawn'),
    ('25000000-0000-4000-8000-000000000813'::uuid,'disqualified')
  loop
    v_preview := public.studio2_participation_status_change_preview(v_edition,v_country,null,v_status);
    perform public.studio2_apply_participation_status(v_edition,v_country,null,v_status,
      v_country,'lineup-'||v_status,(v_preview->>'expectedVersion')::bigint);
  end loop;
  -- Preserve historical projection evidence until the canonical calculate.
  if (select count(*) from public.results where show_id=v_show) <> 3 then
    raise exception 'Withdrawal/disqualification unexpectedly destroyed historical Results';
  end if;
  if (private.studio2_result_preconditions(v_show)->>'participantCount')::integer <> 1 then
    raise exception 'Canonical participation transitions did not produce one current participant';
  end if;
  select coalesce((select calculation_version from public.studio2_result_operations where show_id=v_show),0) into v_version;
  v_result := public.studio2_execute_result_operation(v_show,'calculate','Reconcile canonical current lineup',v_execution,v_version);
  if (v_result->>'calculationVersion')::bigint <> v_version+1 then
    raise exception 'Calculation did not advance exactly one version';
  end if;
  if (select count(*) from public.results where show_id=v_show) <> 1
     or not exists(select 1 from public.results where id=v_current_id and show_id=v_show
       and country_id='25000000-0000-4000-8000-000000000811'
       and jury_points=0 and televote_points=0 and total_points=0 and final_rank=1) then
    raise exception 'Stale Results survived or current participant projection changed';
  end if;
  if not (private.studio2_result_preconditions(v_show)->>'resultReady')::boolean then
    raise exception 'Canonical participant and Results cardinalities do not reconcile';
  end if;
  if not exists(select 1 from private.v3_result_versions where show_id=v_show and version=v_version+1
    and jsonb_array_length(result_rows)=1) then
    raise exception 'Calculation omitted exact immutable current-lineup snapshot';
  end if;
  v_replay := public.studio2_execute_result_operation(v_show,'calculate','Reconcile canonical current lineup',v_execution,v_version);
  if not (v_replay->>'idempotentReplay')::boolean
     or (select calculation_version from public.studio2_result_operations where show_id=v_show) <> v_version+1
     or (select count(*) from public.studio2_result_operation_executions where execution_id=v_execution) <> 1 then
    raise exception 'Reconciliation changed canonical idempotency semantics';
  end if;
  raise notice 'PASS: current Results lineup, canonical calculation, immutable snapshot and idempotent replay';
end
$test$;
rollback;

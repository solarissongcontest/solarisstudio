begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('28151625-0000-4000-8000-000000000001','authenticated','authenticated','appeal-outcome-reporter@local.invalid',now(),now()),
 ('28151625-0000-4000-8000-000000000002','authenticated','authenticated','appeal-outcome-reviewer@local.invalid',now(),now()),
 ('28151625-0000-4000-8000-000000000003','authenticated','authenticated','appeal-outcome-original@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('28151625-0000-4000-8000-00000000001'||n)::uuid,('28151625-0000-4000-8000-00000000000'||n)::uuid,now(),now() from generate_series(1,3)n;
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
select ('28151625-0000-4000-8000-00000000000'||n)::uuid,'organizer',null from generate_series(2,3)n;
do $outcomes$
declare
 v_outcome text; v_case uuid; v_finding uuid; v_sanction uuid; v_appeal uuid;
 v_submit_operation uuid; v_operation uuid; v_result jsonb; v_replay jsonb; v_readback jsonb; v_replacement integer;
begin
 foreach v_outcome in array array['upheld','reduced','increased','overturned','rejected_ineligible','rejected_late'] loop
  v_case:=gen_random_uuid(); v_finding:=gen_random_uuid(); v_sanction:=gen_random_uuid(); v_operation:=gen_random_uuid(); v_submit_operation:=gen_random_uuid();
  insert into public.integrity_cases(id,public_code,category,identity_mode,reporter_user_id,summary,details,status)
   values(v_case,'OUTCOME-'||v_outcome,'conduct','confidential','28151625-0000-4000-8000-000000000001','Appeal outcome fixture','Original case truth retains immutable adjudication','action_taken');
  insert into public.integrity_case_findings(id,case_id,outcome,summary,rationale,created_by)
   values(v_finding,v_case,'violation','Original finding','Original finding rationale must remain intact','28151625-0000-4000-8000-000000000003');
  insert into public.integrity_case_sanctions(id,case_id,finding_id,final_level,sanction_label,target_type,rationale,created_by,effective_at)
   values(v_sanction,v_case,v_finding,6,public.integrity_sanction_label(6),'account','Original sanction rationale must remain intact','28151625-0000-4000-8000-000000000003',case when v_outcome='rejected_late' then now()-interval '72 hours' else now() end);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28151625-0000-4000-8000-000000000003","session_id":"28151625-0000-4000-8000-000000000013"}',true);
  set local role authenticated;
  begin
   perform public.v3_submit_integrity_appeal(gen_random_uuid(),repeat(md5(v_outcome||':foreign'),2),v_case,v_sanction,'A foreign actor cannot submit this reporter appeal.');
   raise exception 'Foreign actor submitted reporter appeal';
  exception when raise_exception then if sqlerrm<>'Case not available' then raise; end if; end;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28151625-0000-4000-8000-000000000001","session_id":"28151625-0000-4000-8000-000000000011"}',true);
  set local role authenticated;
  v_result:=public.v3_submit_integrity_appeal(v_submit_operation,repeat(md5(v_outcome),2),v_case,v_sanction,'Concrete appeal grounds challenge the sanction outcome.');
  v_appeal:=(v_result->>'appeal_id')::uuid;
  if v_outcome='rejected_late' then
   v_replay:=public.v3_submit_integrity_appeal(v_submit_operation,repeat(md5(v_outcome),2),v_case,v_sanction,'Concrete appeal grounds challenge the sanction outcome.');
   if v_replay->>'appeal_id' is distinct from v_result->>'appeal_id' or v_replay->>'replayed'<>'true' then raise exception 'Late appeal replay diverged'; end if;
   reset role;
   if not exists(select 1 from public.integrity_case_appeals where id=v_appeal and status='rejected_late' and not was_timely and deadline_at<now()) then raise exception 'Late appeal deadline policy lost'; end if;
   continue;
  end if;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28151625-0000-4000-8000-000000000003","session_id":"28151625-0000-4000-8000-000000000013"}',true);
  perform public.studio2_integrity_assign_appeal_reviewer(v_appeal,'28151625-0000-4000-8000-000000000002',gen_random_uuid(),v_outcome||':assign',1);
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28151625-0000-4000-8000-000000000002","session_id":"28151625-0000-4000-8000-000000000012"}',true);
  v_replacement:=case v_outcome when 'reduced' then 4 when 'increased' then 8 else null end;
  v_result:=public.studio2_integrity_resolve_appeal(v_appeal,v_outcome,'Independent reviewed rationale for the canonical appeal outcome.',v_replacement,'{}','{}',v_operation,v_outcome||':resolve',2);
  v_replay:=public.studio2_integrity_resolve_appeal(v_appeal,v_outcome,'Independent reviewed rationale for the canonical appeal outcome.',v_replacement,'{}','{}',v_operation,v_outcome||':resolve',2);
  if v_result is distinct from v_replay then raise exception 'Outcome replay changed: %',v_outcome; end if;
  -- Case resolution reads the same canonical sanctions/appeals transaction;
  -- no realtime, analytics, outbox drain or consumer is invoked by this test.
  v_readback:=public.admin_integrity_case_resolution(v_case);
  if not exists(select 1 from jsonb_array_elements(v_readback->'appeals') a where a->>'id'=v_appeal::text and a->>'status'=v_outcome and (a->>'version')::bigint=3) then raise exception 'Canonical case readback disagrees with appeal: %',v_outcome; end if;
  reset role;
  if not exists(select 1 from public.integrity_case_appeals where id=v_appeal and case_id=v_case and sanction_id=v_sanction and status=v_outcome and version=3) then raise exception 'Appeal/case/sanction scope diverged'; end if;
  if not exists(select 1 from public.integrity_case_sanctions where id=v_sanction and final_level=6 and rationale='Original sanction rationale must remain intact' and status=case when v_outcome in ('reduced','increased') then 'modified_on_appeal' when v_outcome='overturned' then 'overturned' else 'active' end) then raise exception 'Original sanction consequence incoherent: %',v_outcome; end if;
  if v_replacement is not null and not exists(select 1 from public.integrity_case_sanctions where id=(v_result->>'replacement_sanction_id')::uuid and case_id=v_case and finding_id=v_finding and supersedes_sanction_id=v_sanction and final_level=v_replacement and status='active') then raise exception 'Replacement sanction consequence incoherent'; end if;
  if (select count(*) from public.integrity_adjudication_history where operation_id=v_operation and event_type='integrity.appeal_changed')<>1 then raise exception 'Outcome immutable history missing'; end if;
  if (select count(*) from public.integrity_case_events where operation_id=v_operation and event_type='integrity.appeal_changed')<>1 then raise exception 'Outcome durable audit event missing'; end if;
  if not exists(select 1 from public.studio2_operation_receipts where operation_id=v_operation and status='succeeded') then raise exception 'Outcome durable receipt missing'; end if;
 end loop;
end
$outcomes$;
rollback;

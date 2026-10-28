begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('28111828-0000-4000-8000-000000000001','authenticated','authenticated','appeal-reporter@local.invalid',now(),now()),
 ('28111828-0000-4000-8000-000000000002','authenticated','authenticated','appeal-reviewer@local.invalid',now(),now()),
 ('28111828-0000-4000-8000-000000000003','authenticated','authenticated','appeal-original@local.invalid',now(),now()),
 ('28111828-0000-4000-8000-000000000004','authenticated','authenticated','appeal-other@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('28111828-0000-4000-8000-00000000001'||n)::uuid,('28111828-0000-4000-8000-00000000000'||n)::uuid,now(),now() from generate_series(1,4)n;
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
select ('28111828-0000-4000-8000-00000000000'||n)::uuid,'organizer',null from generate_series(2,4)n;
-- Deliberately no legacy user_roles organizer fixture.
insert into public.integrity_cases(id,public_code,category,identity_mode,reporter_user_id,summary,details,status)
values ('28111828-0000-4000-8000-000000000021','APPEAL-RECOVERY','conduct','confidential','28111828-0000-4000-8000-000000000001','Appeal recovery fixture','Concrete adjudication fixture with original history','action_taken');
insert into public.integrity_case_findings(id,case_id,outcome,summary,rationale,created_by)
values ('28111828-0000-4000-8000-000000000031','28111828-0000-4000-8000-000000000021','violation','Original finding','Original finding rationale retained forever','28111828-0000-4000-8000-000000000003');
insert into public.integrity_case_sanctions(id,case_id,finding_id,final_level,sanction_label,target_type,rationale,created_by)
values ('28111828-0000-4000-8000-000000000041','28111828-0000-4000-8000-000000000021','28111828-0000-4000-8000-000000000031',6,public.integrity_sanction_label(6),'account','Original sanction rationale retained forever','28111828-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000001","session_id":"28111828-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $submission$
declare v_first jsonb; v_retry jsonb;
begin
  v_first:=public.v3_submit_integrity_appeal('28111828-0000-4000-8000-000000000101',repeat('c',64),'28111828-0000-4000-8000-000000000021','28111828-0000-4000-8000-000000000041','Concrete grounds challenge the sanction with new evidence.');
  v_retry:=public.v3_submit_integrity_appeal('28111828-0000-4000-8000-000000000101',repeat('c',64),'28111828-0000-4000-8000-000000000021','28111828-0000-4000-8000-000000000041','Concrete grounds challenge the sanction with new evidence.');
  if v_first->>'appeal_id' is null or v_retry->>'appeal_id' is distinct from v_first->>'appeal_id' or v_retry->>'replayed'<>'true' then raise exception 'Appeal submit replay diverged'; end if;
  perform set_config('test.appeal_id',v_first->>'appeal_id',true);
  begin
    perform public.v3_submit_integrity_appeal('28111828-0000-4000-8000-000000000101',repeat('c',64),'28111828-0000-4000-8000-000000000021','28111828-0000-4000-8000-000000000041','Changed request must not replace the original grounds.');
    raise exception 'Changed submit request accepted';
  exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.v3_submit_integrity_appeal('28111828-0000-4000-8000-000000000102',repeat('d',64),'28111828-0000-4000-8000-000000000021','28111828-0000-4000-8000-000000000041','A distinct request must not duplicate the same sanction appeal.');
    raise exception 'Duplicate sanction appeal accepted';
  exception when raise_exception then if sqlerrm<>'An appeal has already been submitted for this sanction' then raise; end if; end;
end
$submission$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000003","session_id":"28111828-0000-4000-8000-000000000013"}',true);
do $assignment$
begin
  begin
    perform public.studio2_integrity_assign_appeal_reviewer(current_setting('test.appeal_id')::uuid,'28111828-0000-4000-8000-000000000003','28111828-0000-4000-8000-000000000103','appeal-review:self',1);
    raise exception 'Original decision-maker became reviewer';
  exception when insufficient_privilege then null; end;
end
$assignment$;
select public.studio2_integrity_assign_appeal_reviewer(current_setting('test.appeal_id')::uuid,'28111828-0000-4000-8000-000000000002','28111828-0000-4000-8000-000000000104','appeal-review:assign',1);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000004","session_id":"28111828-0000-4000-8000-000000000014"}',true);
do $foreign_reviewer$
begin
  begin
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','Independent review supports a lower sanction.',4,'{}','{}','28111828-0000-4000-8000-000000000105','appeal-review:foreign',2);
    raise exception 'Unassigned reviewer resolved appeal';
  exception when insufficient_privilege then null; end;
end
$foreign_reviewer$;
reset role;
do $live_reviewer$
begin
  begin
    update public.integrity_case_reviewers set recused_at=now(),recusal_reason='Actual conflict identified after assignment'
      where case_id='28111828-0000-4000-8000-000000000021' and user_id='28111828-0000-4000-8000-000000000002' and review_role='appeal_reviewer';
    set local role authenticated;
    perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000002","session_id":"28111828-0000-4000-8000-000000000012"}',true);
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','A recused reviewer must never adjudicate.',4,'{}','{}','28111828-0000-4000-8000-000000000111','appeal-review:recused',2);
    raise exception 'Recused reviewer resolved appeal';
  exception when insufficient_privilege then if sqlerrm<>'Appeal reviewer is missing or recused' then raise; end if; end;
  begin
    delete from auth.sessions where id='28111828-0000-4000-8000-000000000012';
    set local role authenticated;
    perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000002","session_id":"28111828-0000-4000-8000-000000000012"}',true);
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','A revoked reviewer must never adjudicate.',4,'{}','{}','28111828-0000-4000-8000-000000000112','appeal-review:revoked',2);
    raise exception 'Revoked reviewer resolved appeal';
  exception when insufficient_privilege then null; end;
  begin
    update public.integrity_case_sanctions set status='overturned' where id='28111828-0000-4000-8000-000000000041';
    set local role authenticated;
    perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000002","session_id":"28111828-0000-4000-8000-000000000012"}',true);
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','A stale appeal cannot replace an inactive sanction.',4,'{}','{}','28111828-0000-4000-8000-000000000113','appeal-review:inactive-sanction',2);
    raise exception 'Inactive sanction was replaced on appeal';
  exception when check_violation then if sqlerrm<>'Appealed sanction is no longer active' then raise; end if; end;
end
$live_reviewer$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28111828-0000-4000-8000-000000000002","session_id":"28111828-0000-4000-8000-000000000012"}',true);
do $resolution$
declare v_first jsonb; v_retry jsonb;
begin
  begin
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','Independent review supports a lower sanction.',4,'{}','{}','28111828-0000-4000-8000-000000000106','appeal-review:stale',1);
    raise exception 'Stale appeal revision accepted';
  exception when serialization_failure then null; end;
  v_first:=public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','Independent review supports a lower sanction.',4,'{}','{}','28111828-0000-4000-8000-000000000107','appeal-review:resolve',2);
  v_retry:=public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'reduced','Independent review supports a lower sanction.',4,'{}','{}','28111828-0000-4000-8000-000000000107','appeal-review:resolve',2);
  if v_first is distinct from v_retry then raise exception 'Lost-response replay diverged'; end if;
  begin
    perform public.studio2_integrity_resolve_appeal(current_setting('test.appeal_id')::uuid,'overturned','Changed outcome must not overwrite the committed decision.',null,'{}','{}','28111828-0000-4000-8000-000000000107','appeal-review:resolve',2);
    raise exception 'Changed resolution request accepted';
  exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.studio2_integrity_assign_appeal_reviewer(current_setting('test.appeal_id')::uuid,'28111828-0000-4000-8000-000000000004','28111828-0000-4000-8000-000000000108','appeal-review:late',3);
    raise exception 'Terminal appeal was reassigned';
  exception when check_violation then null; end;
end
$resolution$;
reset role;
do $history$
begin
  if (select count(*) from public.integrity_case_appeals where sanction_id='28111828-0000-4000-8000-000000000041')<>1 then raise exception 'Semantic duplicate appeal'; end if;
  if not exists(select 1 from public.integrity_case_appeals a join public.integrity_case_sanctions s on s.id=a.replacement_sanction_id
    where a.id=current_setting('test.appeal_id')::uuid and a.status='reduced' and a.version=3 and s.final_level=4 and s.case_id=a.case_id) then raise exception 'Appeal/sanction consequence diverged'; end if;
  if not exists(select 1 from public.integrity_case_sanctions where id='28111828-0000-4000-8000-000000000041' and status='modified_on_appeal' and final_level=6 and rationale='Original sanction rationale retained forever') then raise exception 'Original adjudication rewritten'; end if;
  if (select count(*) from public.integrity_adjudication_history where operation_id='28111828-0000-4000-8000-000000000107' and event_type='integrity.appeal_changed')<>1 then raise exception 'Resolution history missing or duplicated'; end if;
  if not exists(select 1 from public.integrity_case_events where operation_id='28111828-0000-4000-8000-000000000107' and event_type='integrity.appeal_changed') then raise exception 'Durable resolution event missing'; end if;
  if not exists(select 1 from public.studio2_operation_receipts where operation_id='28111828-0000-4000-8000-000000000107' and status='succeeded') then raise exception 'Committed resolution readback missing'; end if;
  begin
    update public.integrity_adjudication_history set rationale='Rewrite' where operation_id='28111828-0000-4000-8000-000000000107';
    raise exception 'Adjudication history mutable';
  exception when others then if sqlerrm='Adjudication history mutable' then raise; end if; end;
end
$history$;
rollback;

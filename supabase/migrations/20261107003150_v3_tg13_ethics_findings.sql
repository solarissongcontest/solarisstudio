begin;

-- TG13 factual findings are committee records, not executable sanctions.
-- Appointment procedure remains governed by the future revised UNITY Charter.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg13.ethics-findings',1,'forward_fix_only',false,null,
      'Immutable, private findings and nonbinding recommendations from explicitly appointed and assigned Ethics Committee members.'
    );
  end if;
end $contract$;

create table public.world_ethics_findings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.world_ethics_cases(id) on delete restrict,
  findings_text text not null,
  reasoning_text text not null,
  recommendation_kind text not null default 'none',
  recommendation_text text,
  prepared_by_person_id uuid not null references public.delegation_people(id) on delete restrict,
  prepared_by_user_id uuid not null,
  prepared_at timestamptz not null default now(),
  case_revision bigint not null,
  evidence_count integer not null default 0,
  operation_id uuid not null unique,
  constraint world_ethics_findings_body_check check (
    length(btrim(findings_text)) between 20 and 12000
    and length(btrim(reasoning_text)) between 20 and 12000
  ),
  constraint world_ethics_findings_recommendation_check check (
    recommendation_kind in (
      'none','warning','censure','voting_suspension',
      'assistance_freeze','court_referral','other'
    )
  ),
  constraint world_ethics_findings_recommendation_text_check check (
    (recommendation_kind='none' and recommendation_text is null)
    or (
      recommendation_kind<>'none'
      and length(btrim(coalesce(recommendation_text,''))) between 10 and 12000
    )
  ),
  constraint world_ethics_findings_revision_check check(case_revision>=2),
  constraint world_ethics_findings_evidence_count_check check(evidence_count between 0 and 100000)
);
create index world_ethics_findings_prepared_idx
  on public.world_ethics_findings(prepared_at desc);

-- A finding is an immutable historical event. Revisions, corrections and
-- constitutional enforcement must use future append-only formal commands.
create trigger world_ethics_findings_no_rewrite
before update or delete on public.world_ethics_findings
for each row execute function private.world_ethics_evidence_immutable();

alter table public.world_ethics_findings enable row level security;
revoke all on public.world_ethics_findings from public,anon,authenticated,service_role;
grant select on public.world_ethics_findings to authenticated,service_role;
create policy world_ethics_findings_private_read
on public.world_ethics_findings for select to authenticated
using (private.world_ethics_can_read_case(case_id));

-- No manager/office title can impersonate a case's assigned current member.
-- Both current committee assignment and explicit governance capability required.
create function public.world_ethics_can_prepare_findings_v1(p_case_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $authorized$
  select coalesce(auth.uid() is not null and exists(
    select 1
    from public.world_ethics_cases c
    join public.world_ethics_case_assignments a
      on a.case_id=c.id and a.ended_at is null
    join public.world_ethics_committee_memberships m
      on m.id=a.member_id and m.organ_id=c.organ_id
      and m.organization_id=c.organization_id
    where c.id=p_case_id
      and c.status in ('assigned','under_review')
      and m.user_id=auth.uid() and m.started_at<=now()
      and m.ended_at is null
      and public.world_access_allowed(
        'world.ethics.findings.record',c.organization_id,null,c.organ_id,'ethics',c.id
      )
  ),false)
$authorized$;
revoke all on function public.world_ethics_can_prepare_findings_v1(uuid)
from public,anon,authenticated;
grant execute on function public.world_ethics_can_prepare_findings_v1(uuid)
to authenticated,service_role;

create function public.world_prepare_ethics_findings_v1(
  p_case_id uuid,
  p_findings text,
  p_reasoning text,
  p_recommendation_kind text,
  p_recommendation_text text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $prepare$
declare
  v_case public.world_ethics_cases%rowtype;
  v_findings text := nullif(btrim(coalesce(p_findings,'')),'');
  v_reasoning text := nullif(btrim(coalesce(p_reasoning,'')),'');
  v_recommendation text := nullif(btrim(coalesce(p_recommendation_text,'')),'');
  v_claim jsonb;
  v_operation_id uuid;
  v_person_id uuid;
  v_finding_id uuid;
  v_evidence_count integer;
  v_result jsonb;
begin
  -- A retry of a successful operation must still reconcile after the
  -- case has advanced to findings_prepared; never use the create-only
  -- status gate before checking the exact previously claimed operation.
  if auth.uid() is null or p_case_id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;
  if v_findings is null or length(v_findings) not between 20 and 12000
    or v_reasoning is null or length(v_reasoning) not between 20 and 12000
    or p_recommendation_kind is null
    or p_recommendation_kind not in (
      'none','warning','censure','voting_suspension',
      'assistance_freeze','court_referral','other'
    )
    or (p_recommendation_kind='none' and v_recommendation is not null)
    or (p_recommendation_kind<>'none'
      and (v_recommendation is null or length(v_recommendation) not between 10 and 12000))
    or p_expected_revision is null or p_expected_revision<1
    or p_operation_id is null
    or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='VALIDATION';
  end if;

  select * into v_case from public.world_ethics_cases where id=p_case_id;
  if not found or not exists (
    select 1 from public.world_ethics_case_assignments a
    join public.world_ethics_committee_memberships m on m.id=a.member_id
    where a.case_id=v_case.id and a.ended_at is null
      and m.organ_id=v_case.organ_id
      and m.organization_id=v_case.organization_id
      and m.user_id=auth.uid() and m.started_at<=now() and m.ended_at is null
      and public.world_access_allowed(
        'world.ethics.findings.record',
        v_case.organization_id,null,v_case.organ_id,'ethics',v_case.id
      )
  ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.ethics.findings.record','R2',
    jsonb_build_object(
      'organizationId',v_case.organization_id,
      'organId',v_case.organ_id,
      'subjectType','world_ethics_case',
      'subjectId',p_case_id
    ),
    jsonb_build_object(
      'caseId',p_case_id,'findings',v_findings,
      'reasoning',v_reasoning,'recommendationKind',p_recommendation_kind,
      'recommendation',v_recommendation,'expectedRevision',p_expected_revision
    )
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Lock the canonical case and exact active assignment before publication.
  select * into v_case from public.world_ethics_cases
  where id=p_case_id for update;
  if v_case.revision is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  if v_case.status not in ('assigned','under_review')
    or exists (select 1 from public.world_ethics_findings existing
      where existing.case_id=p_case_id) then
    raise exception using errcode='23514',message='STATE_CHANGED';
  end if;

  select m.person_id into v_person_id
  from public.world_ethics_case_assignments a
  join public.world_ethics_committee_memberships m on m.id=a.member_id
  where a.case_id=v_case.id and a.ended_at is null
    and m.organization_id=v_case.organization_id
    and m.organ_id=v_case.organ_id
    and m.user_id=auth.uid() and m.started_at<=now() and m.ended_at is null
  for share of a,m;
  if v_person_id is null
    or not public.world_access_allowed(
      'world.ethics.findings.record',
      v_case.organization_id,null,v_case.organ_id,'ethics',v_case.id
    ) then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  -- Case-lock serialization also protects against a concurrent evidence append
  -- from being silently omitted from the frozen provenance count.
  select count(*)::integer into v_evidence_count
  from public.world_ethics_case_evidence e where e.case_id=v_case.id;
  if v_evidence_count>100000 then
    raise exception using errcode='54000',message='EVIDENCE_COUNT_LIMIT';
  end if;
  insert into public.world_ethics_findings(
    case_id,findings_text,reasoning_text,recommendation_kind,
    recommendation_text,prepared_by_person_id,prepared_by_user_id,
    operation_id,case_revision,evidence_count
  ) values(
    v_case.id,v_findings,v_reasoning,p_recommendation_kind,
    v_recommendation,v_person_id,auth.uid(),
    v_operation_id,v_case.revision+1,v_evidence_count
  ) returning id into v_finding_id;

  update public.world_ethics_cases
    set status='findings_prepared',revision=revision+1,updated_at=now()
  where id=v_case.id;
  insert into public.world_ethics_case_history(
    case_id,action,from_state,to_state,subject_person_id,
    actor_user_id,operation_id,revision
  ) values(
    v_case.id,'findings_prepared',v_case.status,'findings_prepared',v_person_id,
    auth.uid(),v_operation_id,v_case.revision+1
  );
  -- No finding text, sanction recommendation, evidence or identity in events.
  perform private.v3_emit_domain_event(
    'world.ethics.findings_prepared','world_ethics_case',v_case.id::text,
    v_case.revision+1,v_operation_id,null,null,
    jsonb_build_object('caseId',v_case.id,'findingId',v_finding_id,
      'organizationId',v_case.organization_id,'revision',v_case.revision+1),
    1,array[]::text[]
  );

  v_result:=jsonb_build_object(
    'ok',true,'caseId',v_case.id,'findingId',v_finding_id,
    'state','findings_prepared','revision',v_case.revision+1,
    'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end $prepare$;

revoke all on function public.world_prepare_ethics_findings_v1(
  uuid,text,text,text,text,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_prepare_ethics_findings_v1(
  uuid,text,text,text,text,bigint,uuid,text,uuid
) to authenticated,service_role;

notify pgrst,'reload schema';
commit;

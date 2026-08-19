begin;

-- Ballot exclusion is a separate human action so an organizer can confirm a
-- false signed declaration, impose/revoke a sanction, and still preserve that
-- misconduct finding as the current decision. Exclusion never hard-deletes the
-- ballot and sanction revocation never restores it.
create or replace function televoting.exclude_integrity_ballot(
  p_preflight_id uuid,
  p_reason text,
  p_organizer_id uuid
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_preflight televoting.vote_preflight_checks%rowtype;
  v_decision televoting.vote_integrity_decisions%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if length(v_reason)<5 then raise exception 'A ballot-exclusion reason is required' using errcode='22023'; end if;

  select * into v_preflight from televoting.vote_preflight_checks where id=p_preflight_id;
  if not found then raise exception 'Integrity declaration not found' using errcode='22023'; end if;
  if v_preflight.submission_id is null then raise exception 'There is no submitted ballot to exclude' using errcode='22023'; end if;

  select * into v_decision from televoting.vote_integrity_decisions where preflight_id=p_preflight_id;
  if not found or v_decision.decision='cleared' then
    raise exception 'Record a human integrity decision before excluding this ballot' using errcode='22023';
  end if;

  update televoting.vote_submissions
  set status='deleted', deletion_category='integrity_moderation'
  where id=v_preflight.submission_id and status<>'deleted';

  update televoting.vote_integrity_decisions
  set ballot_excluded_at=coalesce(ballot_excluded_at,now()),updated_at=now()
  where id=v_decision.id
  returning * into v_decision;

  insert into televoting.integrity_action_audit(preflight_id,decision_id,submission_id,action,organizer_id,reason,metadata)
  values(p_preflight_id,v_decision.id,v_preflight.submission_id,'ballot_excluded',p_organizer_id,v_reason,
    jsonb_build_object('preserved',true,'deletion_category','integrity_moderation','decision_preserved',v_decision.decision));

  return jsonb_build_object(
    'submission_id',v_preflight.submission_id,
    'decision',v_decision.decision,
    'ballot_excluded_at',v_decision.ballot_excluded_at,
    'preserved',true
  );
end;
$$;

revoke all on function televoting.exclude_integrity_ballot(uuid,text,uuid) from public, anon, authenticated;
grant execute on function televoting.exclude_integrity_ballot(uuid,text,uuid) to service_role;

commit;

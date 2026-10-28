begin;
select public.v3_register_migration_contract(
 'v3.integrity.appeal-live-reviewer-boundary',1,'forward_fix_only',false,null,
 'Revalidate live session, active reviewer and sanction/case coherence before appeal resolution; expose canonical appeal revision and retire compatibility UI writers after cutover.'
);
do $patch$
declare v_definition text; v_anchor text; v_signature text;
begin
 foreach v_signature in array array[
  'public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)',
  'public.studio2_integrity_grant_appeal_extension(uuid,timestamptz,text,uuid,text,bigint)'
 ] loop
  v_definition:=pg_get_functiondef(v_signature::regprocedure);
  v_anchor:='begin';
  if strpos(v_definition,E'begin\n  if not public.studio2_access_allowed')=0 then raise exception 'Unrecognized appeal authority: %',v_signature; end if;
  v_definition:=replace(v_definition,E'begin\n  if not public.studio2_access_allowed',E'begin\n  perform private.v3_require_active_auth_session();\n  if not public.studio2_access_allowed');
  if v_signature like '%resolve_appeal%' then
   v_anchor:=$anchor$  select * into v_original
  from public.integrity_case_sanctions$anchor$;
   if strpos(v_definition,v_anchor)=0 then raise exception 'Missing appeal reviewer boundary'; end if;
   v_definition:=replace(v_definition,v_anchor,$guard$
  -- Serialize recusal against adjudication. A stale assigned_reviewer field
  -- must not restore authority after the reviewer's explicit conflict recusal.
  perform 1 from public.integrity_case_reviewers
   where case_id=v_appeal.case_id and user_id=auth.uid() and review_role='appeal_reviewer' and recused_at is null
   for share;
  if not found then raise exception 'Appeal reviewer is missing or recused' using errcode='42501'; end if;
$guard$||v_anchor);
   v_anchor:=$anchor$  if v_original.id is null then raise exception 'Appealed sanction not found' using errcode = 'P0002'; end if;$anchor$;
   if strpos(v_definition,v_anchor)=0 then raise exception 'Missing appealed sanction boundary'; end if;
   v_definition:=replace(v_definition,v_anchor,v_anchor||$guard$
  if v_original.case_id is distinct from v_appeal.case_id then raise exception 'Appeal and sanction case mismatch' using errcode='23514'; end if;
  if v_original.status<>'active' then raise exception 'Appealed sanction is no longer active' using errcode='23514'; end if;
$guard$);
  end if;
  execute v_definition;
 end loop;
 v_definition:=pg_get_functiondef('public.v3_submit_integrity_appeal(uuid,text,uuid,uuid,text)'::regprocedure);
 v_anchor:=E'begin\n  if v_actor is null then';
 if strpos(v_definition,v_anchor)=0 then raise exception 'Unrecognized protected appeal submission'; end if;
 v_definition:=replace(v_definition,v_anchor,E'begin\n  perform private.v3_require_active_auth_session();\n  if v_actor is null then');
 execute v_definition;
 v_definition:=pg_get_functiondef('public.admin_integrity_case_resolution(uuid)'::regprocedure);
 v_anchor:=$anchor$'sanction_id', a.sanction_id,$anchor$;
 if strpos(v_definition,v_anchor)=0 then raise exception 'Unrecognized appeal readback'; end if;
 v_definition:=replace(v_definition,v_anchor,v_anchor||E'\n        \'version\', a.version,');
 execute v_definition;
end
$patch$;
revoke all on function public.admin_assign_integrity_appeal_reviewer(uuid,uuid),
 public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])
 from public,anon,authenticated,service_role;
commit;

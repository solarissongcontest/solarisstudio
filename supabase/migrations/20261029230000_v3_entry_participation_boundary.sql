begin;
select public.v3_register_migration_contract('v3.entry.participation-boundary',1,'forward_fix_only',false,null,'Require a live scoped actor before participation mutation or recovery; serialize canonical Entry status with subject CAS and atomically persist audit, event and receipt. Keep existing Entry projection and immutable-version functions internal.');
-- Preserve the existing operation fingerprint so already-committed requests
-- remain recoverable. All semantic inputs were already bound by the command.
do $boundary$
declare signature regprocedure; definition text; anchor text;
begin
 foreach signature in array array['public.studio2_apply_participation_status(uuid,uuid,uuid,text,uuid,text,bigint)'::regprocedure,'public.studio2_participation_status_change_preview(uuid,uuid,uuid,text)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);
  anchor:=E'begin\n';
  if position(anchor in definition)=0 or position('private.v3_require_active_auth_session' in definition)>0 then raise exception 'Participation boundary implementation drift'; end if;
  definition:=replace(definition,anchor,E'begin\n  perform private.v3_require_active_auth_session();\n  if not private.studio2_user_has_capability(auth.uid(), ''entry.approve'', p_edition_id) then raise exception ''Missing Solaris capability: entry.approve'' using errcode=''42501''; end if;\n');
  definition:=replace(definition,'if p_status not in', 'if p_status is null or p_status not in');
  if signature='public.studio2_apply_participation_status(uuid,uuid,uuid,text,uuid,text,bigint)'::regprocedure then
   anchor:='  select coalesce((';
   if position(anchor in definition)=0 then raise exception 'Participation version read drift'; end if;
   definition:=overlay(definition placing $locks$
  -- The canonical Entry row is locked before its participant mirrors and CAS
  -- row, matching the Entry -> participant projection order. A concurrent Entry
  -- status mutation cannot commit between the version read and the write.
  perform 1 from public.studio2_edition_runtime where edition_id=p_edition_id for share;
  if exists(select 1 from public.studio2_edition_runtime where edition_id=p_edition_id and state='archived') then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
  perform 1 from public.entries where edition_id=p_edition_id and country_id=p_country_id order by id for update;
  perform 1 from public.participants where edition_id=p_edition_id and ((p_country_id is not null and country_id=p_country_id) or (p_country_id is null and country_id is null and contest_entity_id=p_contest_entity_id)) order by id for update;
  perform 1 from public.studio2_participation_status_versions where edition_id=p_edition_id and subject_key=v_subject for update;
  select coalesce(($locks$ from position(anchor in definition) for char_length(anchor));
   anchor:='  v_updated := public.admin_set_participation_status(';
   if position(anchor in definition)=0 then raise exception 'Participation primitive drift'; end if;
   definition:=replace(definition,anchor,$preview$  perform public.studio2_participation_status_change_preview(p_edition_id,p_country_id,p_contest_entity_id,p_status);
  v_updated := public.admin_set_participation_status($preview$);
   anchor:='  return private.studio2_complete_operation(v_operation_id, v_result);';
   if position(anchor in definition)=0 then raise exception 'Participation receipt drift'; end if;
   definition:=replace(definition,anchor,$receipt$
  insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data)
  values(auth.uid(),'participation_status_changed','entries',p_edition_id::text||':'||v_subject,jsonb_build_object('version',v_current_version),v_result);
  -- This durable observation describes the already-owned status transition;
  -- delivery cannot establish participation or official Entry truth.
  perform private.v3_emit_domain_event('participation.changed','participation',p_edition_id::text||':'||v_subject,v_next_version,v_operation_id,p_edition_id,null,v_result,1,array[]::text[]);
  return private.studio2_complete_operation(v_operation_id, v_result);$receipt$);
  end if;
  execute definition;
  execute format('alter function %s set search_path=pg_catalog,public,private,pg_temp',signature);
  execute format('revoke all on function %s from public,anon,service_role',signature);
  execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $boundary$;
notify pgrst,'reload schema';
commit;

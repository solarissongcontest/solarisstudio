begin;

select public.v3_register_migration_contract(
 'v3.integrity.core-actor-authority', 1, 'forward_fix_only', false, null,
 'Require the exact live actor and canonical Integrity capability before any core case/appeal command or receipt replay; service-role transport is not adjudication authority'
);

-- Keep the existing semantic commands, CAS, receipts, history and platform-mode
-- policy. studio2_access_allowed intentionally admits service transport for
-- system workflows; these Integrity commands are actor decisions, so that
-- transport shortcut must not substitute for a live actor's capability.
do $authority$
declare
 v_command record;
 v_oid regprocedure;
 v_definition text;
 v_original text;
 v_pattern text;
begin
 for v_command in select * from (values
  ('public.studio2_integrity_add_case_note(uuid,text,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_assign_case_reviewer(uuid,uuid,text,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_case_transition(uuid,text,uuid,text,bigint,text)', 'manage'),
  ('public.studio2_integrity_link_cases(uuid,uuid,text,text,bigint,uuid,text,uuid,text)', 'manage'),
  ('public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_record_preclearance_ruling(uuid,text,text,text,text[],uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)', 'sanction'),
  ('public.studio2_integrity_recuse_case_reviewer(uuid,text,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text)', 'manage'),
  ('public.studio2_integrity_reply_case(uuid,text,boolean,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_set_case_priority(uuid,text,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)', 'manage'),
  ('public.studio2_integrity_assign_appeal_reviewer(uuid,uuid,uuid,text,bigint)', 'sanction'),
  ('public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)', 'sanction'),
  ('public.studio2_integrity_grant_appeal_extension(uuid,timestamptz,text,uuid,text,bigint)', 'sanction')
 ) as commands(signature, capability) loop
  v_oid := to_regprocedure(v_command.signature);
  if v_oid is null then raise exception 'Missing canonical Integrity command: %', v_command.signature; end if;
  v_definition := pg_get_functiondef(v_oid);
  v_original := v_definition;
  v_pattern := 'if not public\.studio2_access_allowed\(''integrity\.' || v_command.capability || ''',\s*null,\s*false\)';
  if (select count(*) from regexp_matches(v_definition, v_pattern, 'g')) <> 1 then
   raise exception 'Ambiguous canonical Integrity authorization boundary: %', v_command.signature;
  end if;
  v_definition := regexp_replace(v_definition, v_pattern,
   'if not private.studio2_user_has_capability(auth.uid(), ''integrity.' || v_command.capability || ''', null) or not public.studio2_access_allowed(''integrity.' || v_command.capability || ''', null, false)');
  if strpos(v_original, 'perform private.v3_require_active_auth_session();') = 0 then
   -- Place before authorization/operation lookup, not after successful replay.
   v_definition := replace(v_definition,
    'if not private.studio2_user_has_capability(auth.uid(),',
    'perform private.v3_require_active_auth_session();' || chr(10) || '  if not private.studio2_user_has_capability(auth.uid(),');
  end if;
  execute v_definition;
 end loop;
end
$authority$;

-- Repository callers use the governed intake, note, reply, reviewer and
-- reporter-response RPCs. None uses raw DML on these private case components.
-- Their SECURITY DEFINER implementation remains the sole mutation path.
do $component_grants$
declare v_table text; v_column record;
begin
 foreach v_table in array array[
  'integrity_case_access', 'integrity_case_internal_notes',
  'integrity_case_messages', 'integrity_case_requests', 'integrity_case_reviewers'
 ] loop
  execute format('revoke insert, update, delete, truncate on table public.%I from public, anon, authenticated, service_role', v_table);
  -- A table-level REVOKE does not remove independently granted column DML.
  for v_column in select a.attname from pg_attribute a where a.attrelid=to_regclass('public.'||v_table) and a.attnum>0 and not a.attisdropped loop
   execute format('revoke insert (%I), update (%I) on public.%I from public, anon, authenticated, service_role', v_column.attname, v_column.attname, v_table);
  end loop;
 end loop;
end
$component_grants$;

commit;

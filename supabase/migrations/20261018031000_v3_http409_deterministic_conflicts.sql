begin;

-- System V3 conflict transport normalization.
--
-- PostgREST 14 treats SQLSTATE 40001 as a transient serialization failure and
-- retries it. Solaris historically reused 40001 for deterministic optimistic-
-- concurrency / stale-preview application conflicts. Through PostgREST that
-- turns a correct fail-fast conflict into repeated execution and, eventually,
-- a gateway timeout.
--
-- Keep genuine database / worker serialization semantics untouched. This
-- migration therefore rewrites only the explicit allowlist below, whose
-- current 40001 branches represent deterministic business conflicts such as
-- stale preview versions, stale approvals, or immutable workflow state.
--
-- The definitions are derived from the already-applied canonical functions so
-- this forward migration changes only the SQLSTATE literal. Function identity,
-- body, security-definer/invoker mode, search_path, volatility, ownership and
-- existing ACLs remain the existing canonical contract.

do $normalize_deterministic_conflicts$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
  v_signatures constant text[] := array[
    'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)',
    'public.studio2_apply_confirmation_winner_change(uuid,text,uuid,text,uuid,text,bigint,uuid)',
    'public.studio2_apply_eligibility_override_change(text,uuid,uuid,text,uuid,text,timestamptz,uuid,text,bigint)',
    'public.studio2_apply_jury_ballot_review(uuid,text,text,uuid,text,bigint)',
    'public.studio2_apply_jury_dnv(uuid,uuid,uuid,uuid,text,text,uuid,text,bigint)',
    'public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)',
    'public.studio2_apply_next_in_line_window_change(uuid,text,boolean,timestamptz,timestamptz,text,uuid,text,bigint)',
    'public.studio2_apply_participation_status(uuid,uuid,uuid,text,uuid,text,bigint)',
    'public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
    'public.studio2_apply_platform_mode_change(text,text,text[],text,text,uuid,text,bigint,uuid)',
    'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)',
    'public.studio2_apply_voting_declaration_invalidation(uuid,text,uuid,text,bigint)',
    'public.studio2_approve_permission_change(uuid)',
    'public.studio2_approve_transition(uuid)',
    'public.studio2_delete_prediction_round(uuid,uuid,text,bigint)',
    'public.studio2_execute_host_operation(uuid,text,text,uuid,uuid,bigint,jsonb)',
    'public.studio2_execute_result_operation(uuid,text,text,uuid,bigint)',
    'public.studio2_execute_story_operation(uuid,text,text,uuid,bigint,uuid,jsonb)',
    'public.studio2_record_platform_exit_preflight(uuid,text,jsonb,jsonb)',
    'public.studio2_request_permission_change_approval(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
    'public.studio2_review_media_assets_legacy_impl(uuid,jsonb,text)',
    'public.studio2_save_broadcast_rundown(uuid,integer,timestamptz,jsonb,text)',
    'public.studio2_save_prediction_round(uuid,timestamptz,timestamptz,text,text[],integer,uuid,text,bigint)',
    'public.studio2_score_prediction_round(uuid,uuid,text,bigint)',
    'public.studio2_set_broadcast_rundown_lock(uuid,integer,boolean,text)',
    'public.studio2_transition_broadcast_segment(uuid,integer,text,text,text)',
    'televoting.studio2_apply_round_deadline_change(uuid,timestamptz,uuid,text,bigint)',
    'televoting.studio2_apply_round_status_change(uuid,text,uuid,text,bigint,bigint)'
  ];
begin
  foreach v_signature in array v_signatures loop
    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Missing deterministic-conflict function: %', v_signature;
    end if;

    select pg_get_functiondef(v_function::oid)
    into v_definition;

    if position('''40001''' in v_definition) = 0 then
      raise exception
        'Expected deterministic SQLSTATE 40001 was not found in %; review the allowlist instead of silently skipping it',
        v_signature;
    end if;

    v_rewritten := replace(v_definition, '''40001''', '''PT409''');
    if v_rewritten is not distinct from v_definition then
      raise exception 'Could not rewrite deterministic conflict SQLSTATE for %', v_signature;
    end if;

    execute v_rewritten;

    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Function identity changed while normalizing %', v_signature;
    end if;

    select pg_get_functiondef(v_function::oid)
    into v_definition;

    if position('''40001''' in v_definition) > 0 then
      raise exception 'Deterministic SQLSTATE 40001 remains in %', v_signature;
    end if;
    if position('''PT409''' in v_definition) = 0 then
      raise exception 'HTTP 409 SQLSTATE was not installed in %', v_signature;
    end if;
  end loop;
end
$normalize_deterministic_conflicts$;

-- Preserve genuine serialization/lease retry semantics by proving the shared
-- S4 worker boundary still carries 40001 after the targeted rewrite.
do $assert_worker_retry_semantics$
declare
  v_worker regprocedure;
  v_definition text;
begin
  v_worker := to_regprocedure(
    'public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)'
  );
  if v_worker is null then
    raise exception 'Canonical DomainEvent delivery completion function is missing';
  end if;

  select pg_get_functiondef(v_worker::oid)
  into v_definition;

  if position('''40001''' in v_definition) = 0 then
    raise exception
      'DomainEvent delivery lease conflicts no longer retain genuine serialization retry semantics';
  end if;
end
$assert_worker_retry_semantics$;

notify pgrst, 'reload schema';

commit;
-- CANDIDATE ONLY: NOT a tracked Supabase migration and NOT production-authorized.
-- System owner must review against a sanitized hosted-head-equivalent LOCAL baseline,
-- execute isolated local rehearsal, and generate an approved NEW versioned migration
-- with the Supabase CLI before any deployment. NEVER paste this into hosted SQL Editor.
--
-- Scope: deterministic stale-command/optimistic conflicts only.
-- Both paths are supported: old hosted functions with SQLSTATE 40001 and already-
-- normalized clean-source functions with PT409. Mixed/unknown definitions fail closed.
-- No data backfill, user-row query, grant, table or trigger change.
--
-- The 28 original allowlist entries are copied EXACTLY from
-- 20261018031000_v3_http409_deterministic_conflicts.sql; the 29th is the distinct
-- Entry review contract from 20261018024500_v3_entry_review_conflict_http409.sql.
-- A newer canonical function body or changed API requires fresh semantic review.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $v3_reconcile_http409$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
  v_has_old boolean;
  v_has_new boolean;
  v_owner oid;
  v_acl aclitem[];
  v_config text[];
  v_definer boolean;
  v_volatility "char";
  v_signatures constant text[] := array[
    'public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)',
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
      raise exception 'V3 conflict reconciliation blocked: missing function %', v_signature;
    end if;

    select pg_get_functiondef(v_function::oid),
           p.proowner, p.proacl, p.proconfig, p.prosecdef, p.provolatile
      into v_definition, v_owner, v_acl, v_config, v_definer, v_volatility
      from pg_proc p
     where p.oid = v_function::oid;

    v_has_old := position('''40001''' in v_definition) > 0;
    v_has_new := position('''PT409''' in v_definition) > 0;

    -- Both literal codes or neither literal code means the live contract
    -- diverged from the explicit deterministic-conflict allowlist.
    if v_has_old = v_has_new then
      raise exception
        'V3 conflict reconciliation blocked: mixed/unknown SQLSTATE for %, review live definition',
        v_signature;
    end if;

    if v_has_old then
      v_rewritten := replace(v_definition, '''40001''', '''PT409''');
      if v_rewritten is not distinct from v_definition then
        raise exception 'V3 conflict reconciliation failed to transform %', v_signature;
      end if;
      execute v_rewritten;
    end if;

    if to_regprocedure(v_signature) is distinct from v_function then
      raise exception 'V3 conflict reconciliation changed function identity for %', v_signature;
    end if;

    select pg_get_functiondef(v_function::oid)
      into v_definition;

    if position('''40001''' in v_definition) > 0
       or position('''PT409''' in v_definition) = 0 then
      raise exception 'V3 conflict reconciliation postcondition failed for %', v_signature;
    end if;

    if exists (
      select 1 from pg_proc p where p.oid = v_function::oid
      and (
        p.proowner is distinct from v_owner
        or p.proacl is distinct from v_acl
        or p.proconfig is distinct from v_config
        or p.prosecdef is distinct from v_definer
        or p.provolatile is distinct from v_volatility
      )
    ) then
      raise exception 'V3 conflict reconciliation altered owner/ACL/security contract for %', v_signature;
    end if;
  end loop;
end
$v3_reconcile_http409$;

-- Genuine worker retry/lease conflicts must retain serialization_failure.
do $v3_assert_worker_retry$
declare
  v_worker regprocedure;
  v_definition text;
begin
  v_worker := to_regprocedure(
    'public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)'
  );
  if v_worker is null then
    raise exception 'V3 conflict reconciliation missing canonical DomainEvent worker';
  end if;
  select pg_get_functiondef(v_worker::oid) into v_definition;
  if position('''40001''' in v_definition) = 0 then
    raise exception
      'V3 conflict reconciliation would erase genuine DomainEvent lease retry semantics';
  end if;
end
$v3_assert_worker_retry$;

notify pgrst, 'reload schema';
commit;

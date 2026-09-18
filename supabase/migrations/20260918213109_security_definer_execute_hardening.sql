begin;

-- Harden SECURITY DEFINER execution boundaries.
-- These functions are implementation helpers or trigger bodies, not public RPCs.
-- Keep deliberately anonymous public_* / submission / voting API surfaces intact.
--
-- Production contains a few legacy helper signatures that a canonical clean
-- replay no longer creates. Harden every target that actually exists so both
-- histories converge without manufacturing obsolete functions.

do $harden$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.append_running_order_for_new_participant()',
    'public.compact_running_order_after_delete()',
    'public.materialize_results_on_show_publish()',
    'public.rerank_results_after_voting_config_change()',
    'public.sync_edition_palette_after_change()',
    'public.sync_qualifiers_after_result_change()',
    'public.sync_qualifiers_after_show_change()',
    'public.sync_results_after_participant_change()',
    'public.sync_results_after_vote_change()',
    'televoting.round_entries_sync_countries()'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_signature
      );
    end if;
  end loop;

  foreach v_signature in array array[
    'public.can_edit_submission(uuid)',
    'public.find_entry_duplicate(uuid,uuid,text,text,text)',
    'public.generate_recovery_code()',
    'public.integrity_can_upload_evidence(text)',
    'public.is_trusted_submission_browser(uuid,text)',
    'public.materialize_show_results_if_missing(uuid)',
    'public.refresh_edition_qualifications(uuid)',
    'public.refresh_show_qualifiers(uuid)',
    'public.sync_edition_palette_to_linked_themes(uuid)',
    'public.sync_show_results_from_votes(uuid)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_signature
      );
      execute format(
        'grant execute on function %s to service_role',
        v_signature
      );
    end if;
  end loop;
end
$harden$;

do $verify$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.append_running_order_for_new_participant()',
    'public.compact_running_order_after_delete()',
    'public.materialize_results_on_show_publish()',
    'public.rerank_results_after_voting_config_change()',
    'public.sync_edition_palette_after_change()',
    'public.sync_qualifiers_after_result_change()',
    'public.sync_qualifiers_after_show_change()',
    'public.sync_results_after_participant_change()',
    'public.sync_results_after_vote_change()',
    'televoting.round_entries_sync_countries()'
  ]
  loop
    if to_regprocedure(v_signature) is not null
       and (
         has_function_privilege('anon', v_signature, 'EXECUTE')
         or has_function_privilege('authenticated', v_signature, 'EXECUTE')
         or has_function_privilege('service_role', v_signature, 'EXECUTE')
       ) then
      raise exception 'Trigger helper still directly executable: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.can_edit_submission(uuid)',
    'public.find_entry_duplicate(uuid,uuid,text,text,text)',
    'public.generate_recovery_code()',
    'public.integrity_can_upload_evidence(text)',
    'public.is_trusted_submission_browser(uuid,text)',
    'public.materialize_show_results_if_missing(uuid)',
    'public.refresh_edition_qualifications(uuid)',
    'public.refresh_show_qualifiers(uuid)',
    'public.sync_edition_palette_to_linked_themes(uuid)',
    'public.sync_show_results_from_votes(uuid)'
  ]
  loop
    if to_regprocedure(v_signature) is not null
       and (
         has_function_privilege('anon', v_signature, 'EXECUTE')
         or has_function_privilege('authenticated', v_signature, 'EXECUTE')
         or not has_function_privilege('service_role', v_signature, 'EXECUTE')
       ) then
      raise exception 'Internal helper privilege boundary invalid: %', v_signature;
    end if;
  end loop;
end
$verify$;

notify pgrst, 'reload schema';

commit;

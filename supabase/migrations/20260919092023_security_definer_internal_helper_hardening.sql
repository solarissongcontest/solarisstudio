begin;

-- Final SECURITY DEFINER helper hardening.
--
-- These functions are implementation helpers, trigger bodies, or nested
-- projections. Solaris never calls them directly from browser/runtime RPC
-- surfaces. PostgreSQL grants EXECUTE to PUBLIC by default, so leaving them
-- exposed causes authenticated users to reach privileged implementation code
-- that is meant to be entered only through guarded wrappers.

do $harden$
declare
  v_signature text;
begin
  -- Trigger bodies must never be directly executable through PostgREST.
  foreach v_signature in array array[
    'public.integrity_apply_case_retention_to_evidence()',
    'public.integrity_validate_evidence_lineage()'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Expected trigger helper is missing: %', v_signature;
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_signature
    );
  end loop;

  -- Nested helpers are callable only by trusted server/service code or by
  -- SECURITY DEFINER wrappers running as their owning database role.
  foreach v_signature in array array[
    'public.can_manage_country_national_finals(uuid)',
    'public.integrity_case_snapshot(uuid)',
    'public.integrity_expire_stale_identity_approvals()',
    'public.integrity_finalize_evidence_token(uuid,uuid,uuid)',
    'public.integrity_reporter_resolution_snapshot(uuid)',
    'public.rulebook_effective_changes(uuid)'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Expected internal helper is missing: %', v_signature;
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      v_signature
    );
  end loop;
end
$harden$;

-- Canonical clean replay carries a handful of legacy helpers that long-lived
-- production no longer exposes. Converge fresh installs to the same boundary.
do $legacy_replay_hardening$
declare
  v_signature text;
begin
  -- Trigger-only / internally chained publication helpers.
  foreach v_signature in array array[
    'public.claim_country_from_signup()',
    'public.refresh_public_results_after_child_change()',
    'public.refresh_public_results_after_show_change()',
    'public.refresh_show_results(uuid)',
    'public.sync_edition_publication_after_show_change()',
    'public.sync_one_edition_publication(uuid)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_signature
      );
    end if;
  end loop;

  -- Compatibility/RPC functions still needed by authenticated country flows or RLS.
  foreach v_signature in array array[
    'public.owns_country(uuid)',
    'public.update_owned_country_identity(text,text,text,text,text,text)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon',
        v_signature
      );
      execute format(
        'grant execute on function %s to authenticated, service_role',
        v_signature
      );
    end if;
  end loop;
end
$legacy_replay_hardening$;

do $verify$
declare
  v_signature text;
  v_owner text;
  v_acl text;
begin
  foreach v_signature in array array[
    'public.claim_country_from_signup()',
    'public.refresh_public_results_after_child_change()',
    'public.refresh_public_results_after_show_change()',
    'public.refresh_show_results(uuid)',
    'public.sync_edition_publication_after_show_change()',
    'public.sync_one_edition_publication(uuid)'
  ]
  loop
    if to_regprocedure(v_signature) is not null
       and (
         has_function_privilege('anon', v_signature, 'EXECUTE')
         or has_function_privilege('authenticated', v_signature, 'EXECUTE')
         or has_function_privilege('service_role', v_signature, 'EXECUTE')
       ) then
      select r.rolname, coalesce(p.proacl::text, '<default>')
      into v_owner, v_acl
      from pg_proc p
      join pg_roles r on r.oid = p.proowner
      where p.oid = to_regprocedure(v_signature);

      raise exception 'Replay-only internal helper still directly executable: % [owner=%, acl=%]',
        v_signature, v_owner, v_acl;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.owns_country(uuid)',
    'public.update_owned_country_identity(text,text,text,text,text,text)'
  ]
  loop
    if to_regprocedure(v_signature) is not null
       and (
         has_function_privilege('anon', v_signature, 'EXECUTE')
         or not has_function_privilege('authenticated', v_signature, 'EXECUTE')
         or not has_function_privilege('service_role', v_signature, 'EXECUTE')
       ) then
      raise exception 'Authenticated compatibility RPC privilege boundary invalid: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.integrity_apply_case_retention_to_evidence()',
    'public.integrity_validate_evidence_lineage()'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'Trigger helper still directly executable: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.can_manage_country_national_finals(uuid)',
    'public.integrity_case_snapshot(uuid)',
    'public.integrity_expire_stale_identity_approvals()',
    'public.integrity_finalize_evidence_token(uuid,uuid,uuid)',
    'public.integrity_reporter_resolution_snapshot(uuid)',
    'public.rulebook_effective_changes(uuid)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'Internal helper privilege boundary invalid: %', v_signature;
    end if;
  end loop;
end
$verify$;

-- Keep the remaining anonymous SECURITY DEFINER surface explicit.
-- These are deliberate public/RLS APIs. Any new anonymous SECURITY DEFINER
-- function outside this reviewed set must fail migration rehearsal.
do $anon_allowlist$
declare
  v_unexpected text;
begin
  select string_agg(
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    ', ' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  )
  into v_unexpected
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public','televoting')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) <> all(array[
      'public.available_country_claims()',
      'public.public_check_entry_duplicate(_edition_id uuid, _submission_id uuid, _artist text, _song_title text, _song_url text)',
      'public.public_country_identity_history(_country_id uuid)',
      'public.public_country_national_finals(_country_id uuid)',
      'public.public_create_anonymous_evidence_upload(_case_code text, _recovery_key text, _name text, _mime text, _size bigint)',
      'public.public_create_anonymous_integrity_case(_category text, _summary text, _details text, _observed_facts text, _uncertainties text, _related_countries text[], _edition_reference text, _case_kind text)',
      'public.public_create_browser_edit_token(_round_id uuid, _browser_session_id text)',
      'public.public_current_rulebook_release()',
      'public.public_finalize_anonymous_evidence(_case_code text, _recovery_key text, _token_id uuid)',
      'public.public_find_my_submission(_round_id uuid, _browser_session_id text)',
      'public.public_get_anonymous_integrity_case(_case_code text, _recovery_key text)',
      'public.public_get_anonymous_integrity_resolution(_case_code text, _recovery_key text)',
      'public.public_get_recovery_code(_submission_id uuid, _browser_session_id text)',
      'public.public_integrity_decisions()',
      'public.public_integrity_stats()',
      'public.public_load_draft(_round_id uuid, _browser_session_id text)',
      'public.public_lookup_submission(_round_id uuid, _country text)',
      'public.public_next_in_line_countries()',
      'public.public_next_in_line_country(_edition_id uuid, _country text)',
      'public.public_recover_submission(_round_id uuid, _country text, _recovery_code text, _browser_session_id text)',
      'public.public_reply_anonymous_integrity_case(_case_code text, _recovery_key text, _body text)',
      'public.public_resolve_edit_token(_token_hash text)',
      'public.public_rule_interpretations(_rule_id text)',
      'public.public_rulebook_release_history()',
      'public.public_safe_participants(_edition_id uuid, _show_id uuid)',
      'public.public_save_draft(_round_id uuid, _browser_session_id text, _payload jsonb, _instagram_username text, _country text, _ip text)',
      'public.public_set_recovery_code(_submission_id uuid, _browser_session_id text, _recovery_code text)',
      'public.public_submit_anonymous_integrity_appeal(_case_code text, _recovery_key text, _sanction_id uuid, _grounds text)',
      'public.round_availability(_round_id uuid)',
      'public.shared_prediction(_share_token uuid)',
      'public.show_publication_enabled(_show_id uuid, _key text)',
      'public.studio2_access_allowed(p_capability text, p_edition_id uuid, p_strict_before_cutover boolean)',
      'public.studio2_anniversary_engine(p_reference_date date, p_limit integer)',
      'public.studio2_public_home_announcements(p_limit integer)',
      'public.studio2_public_storyline(p_edition_slug text)',
      'public.studio2_public_storylines(p_limit integer)',
      'public.submit_confirmation(payload jsonb)',
      'public.submit_next_in_line(payload jsonb)',
      'televoting.submit_vote_checked(p_round_id uuid, p_username text, p_country_code text, p_entries jsonb, p_preflight_token uuid, p_ip_hash text, p_fingerprint_hash text, p_device_token_hash text, p_ip_country text, p_is_vpn boolean)'
    ]::text[]);

  if v_unexpected is not null then
    raise exception 'Unexpected anonymous SECURITY DEFINER function(s): %', v_unexpected;
  end if;
end
$anon_allowlist$;

notify pgrst, 'reload schema';

commit;

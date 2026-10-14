export const V3_SYSTEM_PHYSICAL_AUDIT_SOURCE = {
  projectId: "dkxmnvekiopyesuzggeu",
  inspectedAt: "2026-10-14",
  method: "read-only information_schema / pg_catalog inventory plus to_regclass verification",
} as const;

/**
 * Physical tables verified to exist in the connected Solaris Supabase project.
 *
 * This is evidence, not a proposal. A table only appears here when it was
 * observed in the live read-only schema inventory on the audit date above.
 * Shared physical tables may legitimately appear under more than one domain
 * when they form a boundary between those domains.
 */
export const V3_VERIFIED_DOMAIN_TABLES: Readonly<Record<string, readonly string[]>> = {
  edition: [
    "public.editions",
    "public.studio2_edition_runtime",
  ],
  delegation: [
    "public.country_accounts",
    "public.delegation_hod_assignments",
    "public.delegation_people",
    "public.country_hod_edition_claims",
    "public.studio2_delegation_settings",
  ],
  participation: [
    "public.participants",
    "public.studio2_participation_status_versions",
  ],
  confirmation: [
    "public.submission_rounds",
    "public.submissions",
    "public.submission_versions",
    "public.submission_drafts",
    "public.submission_review_history",
    "public.submission_browser_sessions",
    "public.studio2_confirmation_requirements",
    "public.studio2_confirmation_review_versions",
    "public.studio2_confirmation_round_versions",
    "private.v3_confirmation_account_drafts",
    "private.v3_confirmation_operations",
  ],
  entry: [
    "public.entries",
    "public.internal_entries",
  ],
  "national-selection": [
    "public.national_finals",
    "public.national_final_entries",
  ],
  jury: [
    "public.jury_voting_windows",
    "public.jury_ballot_statuses",
    "public.jury_ballot_submissions",
    "public.jury_votes",
    "public.studio2_jury_members",
    "public.studio2_jury_window_versions",
  ],
  televote: [
    "public.televote_votes",
    "public.televoting_round_bindings",
    "public.public_televote_country_contributions",
    "public.studio2_televote_global_versions",
    "public.studio2_televote_round_versions",
    "televoting.rounds",
    "televoting.round_countries",
    "televoting.round_entries",
    "televoting.round_results",
    "televoting.vote_submissions",
    "televoting.vote_entries",
    "televoting.televote_aggregations",
    "televoting.televote_aggregation_sources",
    "televoting.televote_aggregation_participants",
    "televoting.combined_televote_results",
    "televoting.combined_televote_component_results",
  ],
  results: [
    "public.results",
    "public.studio2_result_operations",
    "public.studio2_result_operation_executions",
  ],
  publication: [
    "public.studio2_show_publication_controls",
    "public.studio2_show_publication_executions",
  ],
  notice: [
    "public.studio2_official_notices",
    "public.studio2_notice_versions",
  ],
  acknowledgement: ["public.studio2_notice_receipts"],
  task: ["public.studio2_organizer_tasks"],
  "country-identity": [
    "public.countries",
    "public.country_edition_identities",
  ],
  "country-profile": [
    "public.country_profiles",
    "public.country_profile_sections",
    "public.country_media",
    "public.country_themes",
    "public.country_design_presets",
    "public.country_font_assets",
  ],
  media: [
    "public.country_media",
    "public.studio2_country_media_upload_tokens",
    "public.studio2_media_asset_reviews",
    "public.studio2_upload_authorizations",
  ],
  rules: [
    "public.ssc_rule_registry",
    "public.ssc_rulebook_releases",
    "public.ssc_rulebook_events",
    "public.ssc_rulebook_change_items",
    "public.ssc_rule_interpretations",
    "public.ssc_rule_interpretation_sources",
  ],
  integrity: [
    "public.integrity_cases",
    "public.integrity_case_access",
    "public.integrity_case_appeals",
    "public.integrity_case_events",
    "public.integrity_case_evidence",
    "public.integrity_case_findings",
    "public.integrity_case_internal_notes",
    "public.integrity_case_messages",
    "public.integrity_case_relations",
    "public.integrity_case_requests",
    "public.integrity_case_reviewers",
    "public.integrity_case_rule_links",
    "public.integrity_case_sanctions",
    "public.integrity_evidence_access_log",
    "public.integrity_evidence_upload_tokens",
    "public.integrity_identity_disclosure_requests",
    "public.integrity_preclearance_rulings",
    "public.integrity_public_decisions",
    "televoting.vote_integrity_decisions",
    "televoting.vote_moderation_events",
    "televoting.vote_preflight_checks",
    "televoting.voter_sanctions",
    "televoting.anti_abuse_events",
    "televoting.integrity_action_audit",
  ],
  permissions: [
    "public.studio2_access_roles",
    "public.studio2_capabilities",
    "public.studio2_capability_grants",
    "public.studio2_role_assignments",
    "public.studio2_role_capabilities",
    "public.studio2_permission_change_approval_requests",
    "public.studio2_permission_state_versions",
    "public.studio2_permission_subject_versions",
    "public.permission_evaluation_events",
  ],
  "live-show": [
    "public.shows",
    "public.studio2_edition_runtime",
  ],
  incident: ["public.studio2_incidents"],
  "next-in-line": [
    "public.next_in_line_responses",
    "public.next_in_line_submissions",
    "public.studio2_next_in_line_windows",
  ],
  prediction: [
    "public.prediction_rounds",
    "public.prediction_items",
    "public.prediction_entries",
    "public.prediction_entry_versions",
    "public.prediction_consensus_snapshots",
    "public.prediction_scores",
  ],
  fantasy: [
    "public.fantasy_games",
    "public.fantasy_game_entries",
    "public.fantasy_teams",
    "public.fantasy_team_entries",
  ],
  "community-profile": ["public.fan_profiles"],
  "personal-preference": [
    "public.fan_follows",
    "public.fan_taste_ballots",
  ],
  activity: [
    "public.content_events",
    "public.fan_event_reads",
  ],
  "public-ux": [
    "public.public_ux_events",
    "public.public_web_vitals",
  ],
  notification: [
    "public.notification_deliveries",
    "public.notification_preferences",
    "public.app_push_subscriptions",
    "public.admin_notifications",
  ],
  identity: [
    "auth.users",
    "auth.identities",
  ],
  account: [
    "public.country_accounts",
    "auth.users",
  ],
  session: [
    "auth.sessions",
    "auth.refresh_tokens",
  ],
  membership: [
    "public.delegation_hod_assignments",
    "public.studio2_role_assignments",
  ],
  "voting-configuration": [
    "public.jury_voting_windows",
    "public.televoting_round_bindings",
    "public.studio2_voting_declaration_policy",
  ],
  receipt: [
    "public.studio2_operation_receipts",
    "public.studio2_notice_receipts",
  ],
  audit: [
    "public.admin_audit_log",
    "auth.audit_log_entries",
    "televoting.admin_audit_log",
    "televoting.integrity_action_audit",
  ],
  "feature-rollout": [
    "public.studio2_feature_flags",
    "public.public_ia_rollout_state",
  ],
  "system-job": [
    "cron.job",
    "cron.job_run_details",
    "net.http_request_queue",
    "net._http_response",
  ],
  story: [
    "public.studio2_storylines",
    "public.studio2_storyline_items",
    "public.studio2_story_operation_executions",
  ],
};

export const V3_VERIFIED_PHYSICAL_TABLES = new Set(
  Object.values(V3_VERIFIED_DOMAIN_TABLES).flat(),
);

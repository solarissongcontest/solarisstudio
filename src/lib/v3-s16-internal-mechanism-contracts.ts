import type { InternalMechanismContract, InternalCallerContract } from './v3-s16-internal-mechanisms';
// Reviewed implementation fingerprints, not trigger-name exemptions. Runtime
// exposure, caller graph, attachment and table/column ACLs must independently pass.
export const V3_INTERNAL_MECHANISM_CONTRACTS: readonly InternalMechanismContract[] = [
  {
    "domain": "contest-lifecycle",
    "signature": "private.studio2_transition_edition_v3(p_edition_id uuid, p_to text, p_reason text, p_approval_request_id uuid, p_expected_version bigint, p_operation_id uuid, p_idempotency_key text)",
    "definitionHash": "dd287fcb2a0e4afacf02378856209fb2",
    "securityDefiner": true,
    "callerSignatures": [
      "public.studio2_transition_edition_v3(p_edition_id uuid, p_to text, p_reason text, p_approval_request_id uuid, p_expected_version bigint, p_operation_id uuid, p_idempotency_key text)"
    ],
    "category": "primitive",
    "reason": "Owner-only lifecycle implementation reached through the live-session canonical transition command; owns CAS, fingerprint, receipt and event atomically.",
    "inputTables": [
      "public.editions",
      "public.studio2_edition_runtime"
    ],
    "attachments": [],
    "proof": ".github/tests/v3-archive-runtime-mechanisms.sql"
  },
  {
    "domain": "contest-lifecycle",
    "signature": "private.v3_guard_archive_runtime_transition()",
    "definitionHash": "82c1e7f5c6496fc647615a87754b8e7e",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects Archive without an owner-only transaction gate and forbids all archived runtime changes; never selects a lifecycle transition.",
    "inputTables": [
      "private.v3_archive_runtime_transition_gates",
      "public.studio2_edition_runtime"
    ],
    "attachments": [
      {
        "table": "public.studio2_edition_runtime",
        "type": 31
      }
    ],
    "proof": ".github/tests/v3-archive-runtime-mechanisms.sql"
  },
  {
    "domain": "contest-lifecycle",
    "signature": "private.v3_guard_archived_legacy_edition_status()",
    "definitionHash": "e502904b663f5ce6bfa81c0fb945834d",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects reversal of legacy status after canonical Archive; returns NEW without establishing lifecycle state.",
    "inputTables": [
      "public.editions",
      "public.studio2_edition_runtime"
    ],
    "attachments": [
      {
        "table": "public.editions",
        "type": 19
      }
    ],
    "proof": ".github/tests/v3-archive-runtime-mechanisms.sql"
  },
  {
    "domain": "contest-lifecycle",
    "signature": "private.v3_sync_archived_edition_legacy_status()",
    "definitionHash": "a35ab43ea88fd7e74e044f78b51db507",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "projection",
    "reason": "One-way completed legacy status derived transactionally from the canonical archived runtime; cannot authorize or reverse Archive.",
    "inputTables": [
      "public.editions",
      "public.studio2_edition_runtime"
    ],
    "attachments": [
      {
        "table": "public.studio2_edition_runtime",
        "type": 21
      }
    ],
    "proof": ".github/tests/v3-archive-runtime-mechanisms.sql"
  },

  {
    "domain": "televote",
    "signature": "private.studio2_guard_direct_client_write()",
    "definitionHash": "c28035d7628f91b70938209a32e28ebc",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "public.televote_votes"
    ],
    "attachments": [
      {
        "table": "public.televote_votes",
        "type": 30
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.studio2_guard_direct_televote_status()",
    "definitionHash": "4d8d97174a200d07c52820844a4ed9e2",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": false,
    "inputTables": [
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.rounds",
        "type": 19
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.studio2_touch_televote_global_version()",
    "definitionHash": "63f44be723b5fef81e106dad148e27d1",
    "category": "housekeeping",
    "reason": "Bounded timestamp, identity normalization or server version maintenance; custom identity is owned by save_custom, not this trigger.",
    "securityDefiner": true,
    "inputTables": [
      "public.studio2_televote_global_versions",
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.rounds",
        "type": 29
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.studio2_touch_televote_round_version()",
    "definitionHash": "15f22ec5ab0e38e4984628a3ce8d619e",
    "category": "housekeeping",
    "reason": "Bounded timestamp, identity normalization or server version maintenance; custom identity is owned by save_custom, not this trigger.",
    "securityDefiner": true,
    "inputTables": [
      "public.studio2_televote_round_versions",
      "televoting.round_entries",
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.round_entries",
        "type": 29
      },
      {
        "table": "televoting.rounds",
        "type": 21
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_apply_published_televote_projection(p_edition_id uuid, p_show_id uuid, p_source_type text, p_source_id text, p_source_version integer, p_source_published_at timestamp with time zone, p_rows jsonb)",
    "definitionHash": "b3363674b7b42d1a17adbb99fe1d680b",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "private.v3_televote_result_projection_sources",
      "public.televote_votes",
      "televoting.rounds",
      "televoting.televote_aggregations"
    ],
    "attachments": [],
    "callerSignatures": [
      "private.v3_sync_published_televote_aggregation(p_aggregation_id uuid)",
      "private.v3_sync_published_televote_round(p_round_id uuid)"
    ],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_configure_round_conversion(p_round_id uuid, p_action text, p_payload jsonb, p_expected_round_version bigint, p_operation_id uuid, p_idempotency_key text)",
    "definitionHash": "d3ca53683aaa5e87128cef45f086376c",
    "category": "primitive",
    "reason": "Owner-only implementation behind scoped active-session canonical entrypoints; actor identity is derived by the caller.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.rounds"
    ],
    "attachments": [],
    "callerSignatures": [
      "televoting.v3_configure_round(p_round_id uuid, p_action text, p_payload jsonb, p_expected_round_version bigint, p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid)",
      "televoting.v3_recover_conversion_calculation(p_round_id uuid, p_expected_round_version bigint, p_operation_id uuid)"
    ],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_enforce_televote_submission_deadline()",
    "definitionHash": "a6444ecf4b76d330b3049345820941d4",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.vote_submissions"
    ],
    "attachments": [
      {
        "table": "televoting.vote_submissions",
        "type": 7
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_archived_edition_workflow_write()",
    "definitionHash": "f483ca6eae32faa5f9e729bf343e8888",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "public.televote_votes"
    ],
    "attachments": [
      {
        "table": "public.televote_votes",
        "type": 31
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_archived_televote_write()",
    "definitionHash": "1ae86579f712177d38f4e9d6f5016379",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.combined_televote_results",
      "televoting.round_countries",
      "televoting.round_entries",
      "televoting.rounds",
      "televoting.televote_aggregations",
      "televoting.vote_entries",
      "televoting.vote_submissions"
    ],
    "attachments": [
      {
        "table": "televoting.combined_televote_results",
        "type": 31
      },
      {
        "table": "televoting.round_countries",
        "type": 31
      },
      {
        "table": "televoting.round_entries",
        "type": 31
      },
      {
        "table": "televoting.rounds",
        "type": 31
      },
      {
        "table": "televoting.televote_aggregations",
        "type": 31
      },
      {
        "table": "televoting.vote_entries",
        "type": 31
      },
      {
        "table": "televoting.vote_submissions",
        "type": 31
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_direct_televote_deadline()",
    "definitionHash": "bb2cdc9b1250fb87716f0abb0566dbc9",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": false,
    "inputTables": [
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.rounds",
        "type": 19
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_source_managed_televote_projection()",
    "definitionHash": "3e88b454a35974e2169643fec6180c2a",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "public.televote_votes"
    ],
    "attachments": [
      {
        "table": "public.televote_votes",
        "type": 31
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_televote_entry_scope()",
    "definitionHash": "cebd60ba21041aac95a736507de4dcfa",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.vote_entries"
    ],
    "attachments": [
      {
        "table": "televoting.vote_entries",
        "type": 23
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_guard_televote_submission_identity()",
    "definitionHash": "f1f3b240d96c644b7a36e00ddcf13a03",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.vote_submissions"
    ],
    "attachments": [
      {
        "table": "televoting.vote_submissions",
        "type": 23
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_sync_published_televote_aggregation_trigger()",
    "definitionHash": "14865d54667192782c03bef632c6c79f",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.televote_aggregations"
    ],
    "attachments": [
      {
        "table": "televoting.televote_aggregations",
        "type": 21
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_sync_published_televote_round_trigger()",
    "definitionHash": "8686720f6783da67264d443226ae760b",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.rounds",
        "type": 21
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "private.v3_touch_televote_submission_version()",
    "definitionHash": "3d263c32d78e628ea9f2f770a7efc229",
    "category": "housekeeping",
    "reason": "Bounded timestamp, identity normalization or server version maintenance; custom identity is owned by save_custom, not this trigger.",
    "securityDefiner": true,
    "inputTables": [
      "public.studio2_televote_submission_versions",
      "televoting.vote_entries",
      "televoting.vote_submissions"
    ],
    "attachments": [
      {
        "table": "televoting.vote_entries",
        "type": 29
      },
      {
        "table": "televoting.vote_submissions",
        "type": 21
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "public.assert_entity_edition()",
    "definitionHash": "37575ab5e2147a1f907792ca8db35b80",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": false,
    "inputTables": [
      "public.televote_votes"
    ],
    "attachments": [
      {
        "table": "public.televote_votes",
        "type": 23
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "public.sync_results_after_vote_change()",
    "definitionHash": "b84dc1dc337033a0033b20341cade9f6",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "public.jury_votes",
      "public.televote_votes"
    ],
    "attachments": [
      {
        "table": "public.televote_votes",
        "type": 29
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.block_sanctioned_submission()",
    "definitionHash": "1b902a6e1fc4bfd4c7caa9b5e72bf3e8",
    "category": "guard",
    "reason": "Rejects invalid mutation; returns NEW/OLD only, never establishes business state.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.vote_submissions"
    ],
    "attachments": [
      {
        "table": "televoting.vote_submissions",
        "type": 7
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.exclude_integrity_ballot(p_preflight_id uuid, p_reason text, p_organizer_id uuid)",
    "definitionHash": "d3943730f31726939c042de0bb4cc2e1",
    "category": "primitive",
    "reason": "Owner-only implementation behind scoped active-session canonical entrypoints; actor identity is derived by the caller.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.integrity_action_audit",
      "televoting.vote_integrity_decisions",
      "televoting.vote_submissions"
    ],
    "attachments": [],
    "callerSignatures": [
      "televoting.organizer_exclude_integrity_ballot(p_preflight_id uuid, p_reason text)"
    ],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.flag_aggregation_outdated()",
    "definitionHash": "403c62ceb13ef6101ac9f8ceca14244d",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.external_score_entries",
      "televoting.televote_aggregation_participants",
      "televoting.televote_aggregation_sources",
      "televoting.televote_aggregations"
    ],
    "attachments": [],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.flag_round_results_outdated()",
    "definitionHash": "a785fe72d7ce7e09016005b732fae467",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.round_countries",
      "televoting.round_entries",
      "televoting.rounds"
    ],
    "attachments": [
      {
        "table": "televoting.round_countries",
        "type": 29
      },
      {
        "table": "televoting.round_entries",
        "type": 29
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text, p_organizer_id uuid)",
    "definitionHash": "26899513c63c7766c7b48fcbcd049b61",
    "category": "primitive",
    "reason": "Owner-only implementation behind scoped active-session canonical entrypoints; actor identity is derived by the caller.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.integrity_action_audit",
      "televoting.vote_integrity_decisions",
      "televoting.vote_submissions"
    ],
    "attachments": [],
    "callerSignatures": [
      "televoting.organizer_record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text)"
    ],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.round_entries_normalize()",
    "definitionHash": "b3053678a10314f82516d1d30a01b8b1",
    "category": "housekeeping",
    "reason": "Bounded timestamp, identity normalization or server version maintenance; custom identity is owned by save_custom, not this trigger.",
    "securityDefiner": false,
    "inputTables": [
      "televoting.round_entries"
    ],
    "attachments": [
      {
        "table": "televoting.round_entries",
        "type": 23
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.round_entries_sync_countries()",
    "definitionHash": "65b666c14e6ec2398413263b2eaa7c5f",
    "category": "projection",
    "reason": "Derives invalidation, membership mirror or published-source projection from canonical inputs in the same transaction; source remains truth and transaction failure rolls back.",
    "securityDefiner": true,
    "inputTables": [
      "televoting.round_countries",
      "televoting.round_entries"
    ],
    "attachments": [
      {
        "table": "televoting.round_entries",
        "type": 29
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "televote",
    "signature": "televoting.update_updated_at_column()",
    "definitionHash": "bcbb6890600f079fefa1d9e9e87bc9ff",
    "category": "housekeeping",
    "reason": "Bounded timestamp, identity normalization or server version maintenance; custom identity is owned by save_custom, not this trigger.",
    "securityDefiner": false,
    "inputTables": [
      "televoting.combined_televote_results",
      "televoting.rounds",
      "televoting.televote_aggregations"
    ],
    "attachments": [
      {
        "table": "televoting.combined_televote_results",
        "type": 19
      },
      {
        "table": "televoting.rounds",
        "type": 19
      },
      {
        "table": "televoting.televote_aggregations",
        "type": 19
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-televote-internal-mechanisms.sql"
  },
  {
    "domain": "integrity",
    "signature": "private.v3_integrity_history_consequence_trigger()",
    "definitionHash": "208bf88815fb8e34b288e9de4833dc67",
    "category": "projection",
    "reason": "Observe immutable history and derive workflow tasks from canonical current state; never adjudicate a case or mutate a sanction. Delivery errors remain durably pending.",
    "securityDefiner": true,
    "inputTables": [
      "public.integrity_adjudication_history"
    ],
    "attachments": [
      {
        "table": "public.integrity_adjudication_history",
        "type": 5
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-integrity-durable-consequences.sql"
  },
  {
    "domain": "integrity",
    "signature": "private.v3_enqueue_integrity_history(p_history_id uuid)",
    "definitionHash": "e1026ed83d57e8ebd0f2b5f88b92d6cd",
    "category": "projection",
    "reason": "Observe immutable history and derive workflow tasks from canonical current state; never adjudicate a case or mutate a sanction. Delivery errors remain durably pending.",
    "securityDefiner": true,
    "inputTables": [
      "public.integrity_adjudication_history"
    ],
    "attachments": [],
    "callerSignatures": [
      "private.v3_integrity_history_consequence_trigger()",
      "private.v3_reconcile_integrity_consequences(p_limit integer, p_case_id uuid)"
    ],
    "proof": ".github/tests/v3-integrity-durable-consequences.sql"
  },
  {
    "domain": "integrity",
    "signature": "private.v3_apply_integrity_workflow(p_case_id uuid)",
    "definitionHash": "46b54db0f5d4c30e61cc4d2a8d092075",
    "category": "projection",
    "reason": "Observe immutable history and derive workflow tasks from canonical current state; never adjudicate a case or mutate a sanction. Delivery errors remain durably pending.",
    "securityDefiner": true,
    "inputTables": [
      "public.integrity_adjudication_history",
      "public.integrity_cases",
      "public.integrity_case_appeals",
      "public.integrity_case_sanctions"
    ],
    "attachments": [],
    "callerSignatures": [
      "private.v3_reconcile_integrity_consequences(p_limit integer, p_case_id uuid)"
    ],
    "proof": ".github/tests/v3-integrity-durable-consequences.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.studio2_guard_confirmation_resolution_scope()",
    "definitionHash": "a4a95dc1690ef77644b27367371736dd",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects a resolution outside its exact generation, edition and country; never resolves a requirement itself.",
    "inputTables": [
      "public.studio2_confirmation_requirements"
    ],
    "attachments": [
      {
        "table": "public.studio2_confirmation_requirements",
        "type": 23
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.studio2_guard_direct_client_write()",
    "definitionHash": "c28035d7628f91b70938209a32e28ebc",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects raw API-role DML without selecting business state; the protected source remains command-owned.",
    "inputTables": [
      "public.entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 30
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "private.studio2_guard_direct_client_write()",
    "definitionHash": "c28035d7628f91b70938209a32e28ebc",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects raw API-role DML without selecting business state; the protected source remains command-owned.",
    "inputTables": [
      "public.jury_votes"
    ],
    "attachments": [
      {
        "table": "public.jury_votes",
        "type": 30
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.studio2_guard_direct_confirmation_review_transition()",
    "definitionHash": "76317b0ebaa6b45f8bcf74a04c97ebaf",
    "securityDefiner": false,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Invoker guard rejects raw review transitions; preserves current_user and cannot establish an approval.",
    "inputTables": [
      "public.internal_entries"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 19
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.studio2_guard_duplicate_confirmation_submission()",
    "definitionHash": "77c5eaf3b41e235d87f3427fd2891a8f",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects duplicate completion of an existing generation under a scoped lock; cannot create or waive a requirement.",
    "inputTables": [
      "public.submissions"
    ],
    "attachments": [
      {
        "table": "public.submissions",
        "type": 23
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.studio2_touch_confirmation_review_version()",
    "definitionHash": "231ac23cfcc8f8e78f6418342e039d88",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "housekeeping",
    "reason": "Bounded server review CAS counter derived from affected content; cannot create a review decision.",
    "inputTables": [
      "public.internal_entries",
      "public.national_final_entries",
      "public.national_finals",
      "public.studio2_confirmation_review_versions",
      "public.submissions"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 29
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.studio2_touch_participation_status_version()",
    "definitionHash": "1db6370a8809b63899f54f3e55dd6030",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "housekeeping",
    "reason": "Bounded server CAS counter for affected entry identities; cannot change participation status.",
    "inputTables": [
      "public.entries",
      "public.studio2_participation_status_versions"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 29
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.v3_guard_archived_edition_workflow_write()",
    "definitionHash": "f483ca6eae32faa5f9e729bf343e8888",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects writes owned by an archived edition; returns NEW/OLD and cannot choose a lifecycle transition.",
    "inputTables": [
      "public.studio2_confirmation_requirements",
      "public.submission_rounds",
      "public.submissions"
    ],
    "attachments": [
      {
        "table": "public.studio2_confirmation_requirements",
        "type": 31
      },
      {
        "table": "public.submission_rounds",
        "type": 31
      },
      {
        "table": "public.submissions",
        "type": 31
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_guard_archived_edition_workflow_write()",
    "definitionHash": "f483ca6eae32faa5f9e729bf343e8888",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects writes owned by an archived edition; returns NEW/OLD and cannot choose a lifecycle transition.",
    "inputTables": [
      "public.entries",
      "public.internal_entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 31
      },
      {
        "table": "public.internal_entries",
        "type": 31
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "private.v3_guard_archived_edition_workflow_write()",
    "definitionHash": "f483ca6eae32faa5f9e729bf343e8888",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects writes owned by an archived edition; returns NEW/OLD and cannot choose a lifecycle transition.",
    "inputTables": [
      "public.jury_ballot_submissions",
      "public.jury_votes",
      "public.jury_voting_windows"
    ],
    "attachments": [
      {
        "table": "public.jury_ballot_submissions",
        "type": 31
      },
      {
        "table": "public.jury_votes",
        "type": 31
      },
      {
        "table": "public.jury_voting_windows",
        "type": 31
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.v3_guard_entry_parent_scope()",
    "definitionHash": "4599bde6172a127e8c0fdb2e5d109b08",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects ownership changes of versioned Confirmation content; writes no content or review decision.",
    "inputTables": [
      "private.v3_entry_versions",
      "public.national_final_entries",
      "public.national_finals",
      "public.submissions"
    ],
    "attachments": [
      {
        "table": "public.submissions",
        "type": 19
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "private.v3_guard_jury_vote_object_scope()",
    "definitionHash": "adaed93ac2e737498d1a044ba2d8a4bf",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Checks exact show, edition, voter and recipient ownership; cannot assign points or choose a review outcome.",
    "inputTables": [
      "public.jury_votes"
    ],
    "attachments": [
      {
        "table": "public.jury_votes",
        "type": 23
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_validate_current_entry_pointer()",
    "definitionHash": "87ea2ad5ca945dabaa3037f19a2e074b",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Checks exact latest immutable content/version/review scope; cannot invent a version or review.",
    "inputTables": [
      "private.v3_entry_reviews",
      "private.v3_entry_versions",
      "public.internal_entries",
      "public.national_final_entries",
      "public.national_finals",
      "public.submissions"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 21
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "private.v3_validate_jury_submission_scope()",
    "definitionHash": "59b874ddda46aafd4f7de2277b09b8a6",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Checks the completed matching integrity preflight and DNV exclusion; cannot commit a ballot independently.",
    "inputTables": [
      "public.jury_ballot_submissions"
    ],
    "attachments": [
      {
        "table": "public.jury_ballot_submissions",
        "type": 21
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "private.v3_validate_jury_vote_ballot_scope()",
    "definitionHash": "e3fde0832195ff5cfbdc01685147b8b4",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects votes outside their exact canonical ballot scope; changes no vote or review state.",
    "inputTables": [
      "public.jury_votes"
    ],
    "attachments": [
      {
        "table": "public.jury_votes",
        "type": 21
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "jury",
    "signature": "public.assert_entity_edition()",
    "definitionHash": "37575ab5e2147a1f907792ca8db35b80",
    "securityDefiner": false,
    "callerSignatures": [],
    "category": "guard",
    "reason": "Rejects an entity reference outside the row edition; writes no critical state.",
    "inputTables": [
      "public.jury_votes"
    ],
    "attachments": [
      {
        "table": "public.jury_votes",
        "type": 23
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "public.bump_edition_data_revision()",
    "definitionHash": "457d9e02f2349db408a71481836c75e4",
    "securityDefiner": true,
    "callerSignatures": [],
    "category": "housekeeping",
    "reason": "Advances only the owning edition revision in the source transaction; changes no business lifecycle fields.",
    "inputTables": [
      "public.editions",
      "public.entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 29
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
  {
    "domain": "entry",
    "signature": "public.update_updated_at_column()",
    "definitionHash": "12c2e4a9f1f74f4a42379496ffa28f08",
    "securityDefiner": false,
    "callerSignatures": [],
    "category": "housekeeping",
    "reason": "Only assigns NEW.updated_at=now(); no business decision or independent invocation.",
    "inputTables": [
      "public.entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 19
      }
    ],
    "proof": ".github/tests/v3-shared-invariant-mechanisms.sql"
  },
{
    "domain": "authorization",
    "signature": "private.ensure_country_account_hod_role()",
    "definitionHash": "2d6e98017e30c8ccd0c181684d742c78",
    "securityDefiner": true,
    "callerSignatures": [],
    "proof": ".github/tests/v3-authorization-command-boundary.sql",
    "category": "projection",
    "reason": "Fixed HOD membership derived transactionally from a governed country association; cannot choose another role, actor or scope.",
    "inputTables": [
      "public.country_accounts",
      "public.studio2_role_assignments",
      "public.studio2_capability_grants",
      "public.studio2_permission_subject_versions"
    ],
    "attachments": [
      {
        "table": "public.country_accounts",
        "type": 21
      }
    ]
  },
  {
    "domain": "authorization",
    "signature": "private.studio2_ensure_permission_version(p_user_id uuid)",
    "definitionHash": "96689ba4596e9e4e880eebe60a766e77",
    "securityDefiner": true,
    "callerSignatures": [],
    "proof": ".github/tests/v3-authorization-command-boundary.sql",
    "category": "primitive",
    "reason": "Owner-only bounded revision initialization/increment; canonical access rows remain authority.",
    "inputTables": [
      "public.studio2_role_assignments",
      "public.studio2_capability_grants",
      "public.studio2_permission_subject_versions"
    ],
    "attachments": []
  },
  {
    "domain": "authorization",
    "signature": "public.studio2_apply_permission_change(p_user_id uuid, p_change_kind text, p_key text, p_edition_id uuid, p_expires_at timestamp with time zone, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint)",
    "definitionHash": "7b966a52dc73bb814e153fdb669d278e",
    "securityDefiner": true,
    "callerSignatures": [
      "public.studio2_apply_permission_change_r3(p_user_id uuid, p_change_kind text, p_key text, p_edition_id uuid, p_expires_at timestamp with time zone, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint)",
      "public.studio2_apply_permission_change_r3(p_user_id uuid, p_change_kind text, p_key text, p_edition_id uuid, p_expires_at timestamp with time zone, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint, p_approval_request_id uuid)"
    ],
    "proof": ".github/tests/v3-authorization-command-boundary.sql",
    "category": "primitive",
    "reason": "Owner-only permission write primitive requires a processing receipt from the reviewed two-operator command; cannot claim an independent operation.",
    "inputTables": [
      "public.studio2_role_assignments",
      "public.studio2_capability_grants",
      "public.studio2_permission_subject_versions",
      "public.studio2_permission_change_approval_requests",
      "public.studio2_operation_receipts"
    ],
    "attachments": []
  },
  {
    "domain": "authorization",
    "signature": "public.studio2_apply_permission_change_r3(p_user_id uuid, p_change_kind text, p_key text, p_edition_id uuid, p_expires_at timestamp with time zone, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint)",
    "definitionHash": "1811dd1d0817d8baf52c2273508572a0",
    "securityDefiner": true,
    "callerSignatures": [],
    "proof": ".github/tests/v3-authorization-command-boundary.sql",
    "category": "primitive",
    "reason": "Retired compatibility entry is inaccessible to application roles and cannot create the processing receipt required by the private mutation core.",
    "inputTables": [
      "public.studio2_role_assignments",
      "public.studio2_capability_grants",
      "public.studio2_permission_subject_versions",
      "public.studio2_operation_receipts"
    ],
    "attachments": []
  },
  {
    "domain": "authorization",
    "signature": "private.studio2_touch_permission_subject_version()",
    "definitionHash": "be584848b4803023d0f660929c4b6b30",
    "securityDefiner": true,
    "callerSignatures": [],
    "proof": ".github/tests/v3-authorization-command-boundary.sql",
    "category": "housekeeping",
    "reason": "One attached counter increments only exact affected subjects in the canonical role/grant transaction; no permission decision.",
    "inputTables": [
      "public.studio2_role_assignments",
      "public.studio2_capability_grants",
      "public.studio2_permission_subject_versions"
    ],
    "attachments": [
      {
        "table": "public.studio2_role_assignments",
        "type": 29
      },
      {
        "table": "public.studio2_capability_grants",
        "type": 29
      }
    ]
  },
{
    "domain": "confirmation",
    "signature": "public.admin_restore_confirmation_version_apply(_submission_id uuid, _version_id uuid, _reason text)",
    "definitionHash": "a38392714998c94fabb4d69aeffa9328",
    "securityDefiner": true,
    "callerSignatures": [
      "private.v3_restore_confirmation_version_core(_submission_id uuid, _version_id uuid, _reason text)"
    ],
    "proof": ".github/tests/v3-confirmation-restore-authority.sql",
    "category": "primitive",
    "reason": "Inaccessible historical content implementation, reached only through the active-session reviewed restore command; canonical CAS, receipt, history and consequences commit atomically.",
    "inputTables": [
      "public.submissions",
      "public.internal_entries",
      "public.national_finals",
      "public.national_final_entries",
      "public.submission_versions"
    ],
    "attachments": []
  },
  {
    "domain": "entry",
    "signature": "public.admin_restore_confirmation_version_apply(_submission_id uuid, _version_id uuid, _reason text)",
    "definitionHash": "a38392714998c94fabb4d69aeffa9328",
    "securityDefiner": true,
    "callerSignatures": [
      "private.v3_restore_confirmation_version_core(_submission_id uuid, _version_id uuid, _reason text)"
    ],
    "proof": ".github/tests/v3-confirmation-restore-authority.sql",
    "category": "primitive",
    "reason": "Inaccessible historical content implementation, reached only through the active-session reviewed restore command; canonical CAS, receipt, history and consequences commit atomically.",
    "inputTables": [
      "public.submissions",
      "public.internal_entries",
      "public.national_finals",
      "public.national_final_entries",
      "public.submission_versions"
    ],
    "attachments": []
  },
  {
    "domain": "entry",
    "signature": "public.sync_confirmation_entry_youtube_link()",
    "definitionHash": "7c22d77b3811f3c8c3dde5a228496714",
    "securityDefiner": true,
    "category": "projection",
    "reason": "One-way YouTube mirror of the committed canonical Entry; cannot choose or overwrite Entry truth. Scope is edition/country, unchanged mirrors are not rewritten.",
    "inputTables": [
      "public.entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 21,
        "definitionHash": "4db2e968bbdb6ae6e9671f975b07ecb7"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_supersede_stale_media_reviews()",
    "definitionHash": "2be8a4fc851721980dd552503c484a84",
    "securityDefiner": true,
    "category": "guard",
    "reason": "Entry edits invalidate approval evidence for a different source fingerprint; this mechanism cannot approve media, edit Entry content, or publish anything.",
    "inputTables": [
      "public.entries"
    ],
    "attachments": [
      {
        "table": "public.entries",
        "type": 17,
        "definitionHash": "e271466fddde07187f52c1dff8dbffde"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_apply_entry_credits_context()",
    "definitionHash": "dac7d925b6fc766c07e201d4b0dbcdd7",
    "securityDefiner": true,
    "category": "housekeeping",
    "reason": "Normalizes credits supplied to an already-authorized Confirmation content write. No direct call or raw protected-table DML can invoke it independently.",
    "inputTables": [
      "public.internal_entries",
      "public.national_final_entries"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 23,
        "definitionHash": "d11cbf8be92666b5cd5eb1ee7e9637a0"
      },
      {
        "table": "public.national_final_entries",
        "type": 23,
        "definitionHash": "fdbf6595a2be450092010bc73a1513e7"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_bind_confirmation_entry_version()",
    "definitionHash": "b25c42b20c10cd1f4adf4327ac0b58db",
    "securityDefiner": true,
    "category": "projection",
    "reason": "Records immutable versions derived from actual content and binds reviews to that version. A content change invalidates prior review; it cannot approve new content or change Confirmation ownership.",
    "inputTables": [
      "public.internal_entries",
      "public.national_final_entries",
      "public.submissions",
      "public.national_finals",
      "public.submission_versions",
      "private.v3_entry_versions",
      "private.v3_entry_reviews"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 23,
        "definitionHash": "47faf453bde9d4ef32287fc45e381162"
      },
      {
        "table": "public.national_final_entries",
        "type": 23,
        "definitionHash": "6abaaf522d9a491e96b0612b92e9c419"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "entry",
    "signature": "private.v3_record_inserted_entry_version()",
    "definitionHash": "5437403d1c6d6792f40e28b0237c88db",
    "securityDefiner": true,
    "category": "projection",
    "reason": "AFTER INSERT evidence for the actual inserted Entry only; discarded ON CONFLICT candidates produce no history. Actor and lineage derive from canonical transaction context.",
    "inputTables": [
      "public.internal_entries",
      "public.national_final_entries",
      "public.submissions",
      "public.national_finals",
      "public.submission_versions",
      "private.v3_entry_versions"
    ],
    "attachments": [
      {
        "table": "public.internal_entries",
        "type": 5,
        "definitionHash": "6fa39a25d2b66127e214d81ca23a67d0"
      },
      {
        "table": "public.national_final_entries",
        "type": 5,
        "definitionHash": "33e2d4a12f5dbd4560beca2d8623039f"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "entry",
    "signature": "public.admin_set_participation_status(_edition_id uuid, _country_id uuid, _contest_entity_id uuid, _status text)",
    "definitionHash": "7aeefa24feb7b23d95543011cac65377",
    "securityDefiner": true,
    "category": "primitive",
    "reason": "Owner-only participant/status persistence behind the active-session capability/CAS command. Canonical Entry status, audit, durable observation and receipt commit or roll back together.",
    "inputTables": [
      "public.entries",
      "public.studio2_operation_receipts"
    ],
    "attachments": [],
    "callerSignatures": [
      "public.studio2_apply_participation_status(p_edition_id uuid, p_country_id uuid, p_contest_entity_id uuid, p_status text, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint)"
    ],
    "proof": ".github/tests/v3-entry-runtime-boundary.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.studio2_touch_confirmation_round_version()",
    "definitionHash": "34c7a910b30bb7c74b8d821d5b273af1",
    "securityDefiner": true,
    "category": "housekeeping",
    "reason": "Bounded round CAS advancement from committed round/response mutation; no business transition or externally supplied version is accepted.",
    "inputTables": [
      "public.submissions",
      "public.submission_rounds",
      "public.studio2_confirmation_round_versions"
    ],
    "attachments": [
      {
        "table": "public.submission_rounds",
        "type": 21,
        "definitionHash": "23a81919bccab549cebd8afc22f5c5bd"
      },
      {
        "table": "public.submissions",
        "type": 29,
        "definitionHash": "fae04eb10cfaf020898239f316734dfc"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-confirmation-runtime-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.studio2_confirmation_submission_requirement_trigger()",
    "definitionHash": "bf845e615c99482fb65d0fe2d576bb64",
    "securityDefiner": true,
    "category": "projection",
    "reason": "Transactionally derives fulfillment from canonical response insertion/change/deletion; cannot choose reconfirmation generation or accept a forged actor.",
    "inputTables": [
      "public.submissions",
      "public.studio2_confirmation_requirements"
    ],
    "attachments": [
      {
        "table": "public.submissions",
        "type": 29,
        "definitionHash": "6d9f547c83ecd4797c420591225cd8b0"
      }
    ],
    "callerSignatures": [],
    "proof": ".github/tests/v3-confirmation-runtime-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "private.studio2_reconcile_confirmation_requirement(p_edition_id uuid, p_country_id uuid)",
    "definitionHash": "37be8c445ded4aa48bbd5c3ec278bc4f",
    "securityDefiner": true,
    "category": "projection",
    "reason": "Owner-only canonical-source fulfillment repair; ignores unchanged tuples, preserves invalidated/current generation boundaries and never selects a new reconfirmation generation.",
    "inputTables": [
      "public.submissions",
      "public.studio2_confirmation_requirements",
      "public.studio2_operation_receipts"
    ],
    "attachments": [],
    "callerSignatures": [
      "private.studio2_confirmation_submission_requirement_trigger()",
      "public.admin_confirmation_ensure_requirements(p_edition_id uuid, p_country_ids uuid[])",
      "private.v3_reconcile_confirmation_requirements_core(p_edition_id uuid, p_offset integer, p_limit integer)"
    ],
    "proof": ".github/tests/v3-confirmation-runtime-mechanisms.sql"
  },
  {
    "domain": "confirmation",
    "signature": "public.admin_confirmation_ensure_requirements(p_edition_id uuid, p_country_ids uuid[])",
    "definitionHash": "4590dd5d842e4aed78d8010c70eca012",
    "securityDefiner": true,
    "category": "primitive",
    "reason": "Initial requirement materialization implementation behind reviewed fingerprint/CAS, live actor capability and stable receipt; unavailable as a peer command.",
    "inputTables": [
      "public.submissions",
      "public.studio2_confirmation_requirements",
      "public.studio2_operation_receipts"
    ],
    "attachments": [],
    "callerSignatures": [
      "public.admin_confirmation_apply_requirement_materialization(p_edition_id uuid, p_country_ids uuid[], p_expected_fingerprint text, p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid)"
    ],
    "proof": ".github/tests/v3-confirmation-runtime-mechanisms.sql"
  },
];
export const V3_INTERNAL_CALLER_CONTRACTS: readonly InternalCallerContract[] = [
  {
    "signature": "public.studio2_transition_edition_v3(p_edition_id uuid, p_to text, p_reason text, p_approval_request_id uuid, p_expected_version bigint, p_operation_id uuid, p_idempotency_key text)",
    "definitionHash": "e1f290b2de3f89c385628010aa0cae98",
    "securityDefiner": true,
    "callerSignatures": [
      "public.studio2_transition_edition_v3(p_edition_id uuid, p_to text, p_reason text, p_approval_request_id uuid, p_expected_version bigint, p_operation_id uuid, p_idempotency_key text)"
    ],
    "executeRoles": [
      "postgres",
      "authenticated"
    ],
    "root": true
  },

  {
    "signature": "private.v3_sync_published_televote_aggregation(p_aggregation_id uuid)",
    "definitionHash": "60ab81e0e25af63b8691ee7a356c5fd3",
    "executeRoles": [
      "postgres"
    ],
    "securityDefiner": true,
    "root": false,
    "callerSignatures": [
      "private.v3_sync_published_televote_aggregation_trigger()"
    ]
  },
  {
    "signature": "private.v3_sync_published_televote_aggregation_trigger()",
    "definitionHash": "14865d54667192782c03bef632c6c79f",
    "executeRoles": [
      "postgres"
    ],
    "securityDefiner": true,
    "root": false,
    "callerSignatures": []
  },
  {
    "signature": "private.v3_sync_published_televote_round(p_round_id uuid)",
    "definitionHash": "604eb78f7b80011a9f92694c77be40fb",
    "executeRoles": [
      "postgres"
    ],
    "securityDefiner": true,
    "root": false,
    "callerSignatures": [
      "private.v3_sync_published_televote_round_trigger()"
    ]
  },
  {
    "signature": "private.v3_sync_published_televote_round_trigger()",
    "definitionHash": "8686720f6783da67264d443226ae760b",
    "executeRoles": [
      "postgres"
    ],
    "securityDefiner": true,
    "root": false,
    "callerSignatures": []
  },
  {
    "signature": "televoting.organizer_exclude_integrity_ballot(p_preflight_id uuid, p_reason text)",
    "definitionHash": "ef8ff430fc05a281aac5b48a2fab4373",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "televoting.organizer_record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text)",
    "definitionHash": "124c46ccbfdecb336ab08b430d449b20",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "televoting.v3_configure_round(p_round_id uuid, p_action text, p_payload jsonb, p_expected_round_version bigint, p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid)",
    "definitionHash": "26013ec1266348823095c02153e1d1d3",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "televoting.v3_recover_conversion_calculation(p_round_id uuid, p_expected_round_version bigint, p_operation_id uuid)",
    "definitionHash": "ff25c0162800367609bfbb5c890c21ac",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "private.v3_reconcile_integrity_consequences(p_limit integer, p_case_id uuid)",
    "definitionHash": "4925eca19705638952f5be4438871230",
    "executeRoles": [
      "postgres"
    ],
    "securityDefiner": true,
    "root": false,
    "callerSignatures": [
      "public.studio2_reconcile_integrity_consequences(p_case_id uuid, p_limit integer)"
    ]
  },
  {
    "signature": "public.studio2_reconcile_integrity_consequences(p_case_id uuid, p_limit integer)",
    "definitionHash": "0f127e9cee1364bf1071464ae96950df",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
{
    "signature": "public.studio2_apply_permission_change_r3(p_user_id uuid, p_change_kind text, p_key text, p_edition_id uuid, p_expires_at timestamp with time zone, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint, p_approval_request_id uuid)",
    "definitionHash": "9ca2b425068ac0db1261742907a62731",
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "securityDefiner": true,
    "root": true,
    "callerSignatures": []
  },
{
    "signature": "private.v3_restore_confirmation_version_core(_submission_id uuid, _version_id uuid, _reason text)",
    "definitionHash": "d6119799df78e369b87d8326d3d520c4",
    "securityDefiner": true,
    "executeRoles": [
      "postgres"
    ],
    "root": false,
    "callerSignatures": [
      "public.admin_restore_confirmation_version(_submission_id uuid, _version_id uuid, _reason text, p_expected_revision text, p_operation_id uuid, p_idempotency_key text)"
    ]
  },
  {
    "signature": "public.admin_restore_confirmation_version(_submission_id uuid, _version_id uuid, _reason text, p_expected_revision text, p_operation_id uuid, p_idempotency_key text)",
    "definitionHash": "2ff4603654fdbce21a6d0950dc691a56",
    "securityDefiner": true,
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "public.studio2_apply_participation_status(p_edition_id uuid, p_country_id uuid, p_contest_entity_id uuid, p_status text, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint)",
    "definitionHash": "3d19b2070957d3e697fde39a9bd6fa20",
    "securityDefiner": true,
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "public.admin_confirmation_apply_requirement_materialization(p_edition_id uuid, p_country_ids uuid[], p_expected_fingerprint text, p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid)",
    "definitionHash": "b96a4f6920cf7589661e54bff8f7df81",
    "securityDefiner": true,
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "public.studio2_reconcile_confirmation_requirements(p_edition_id uuid, p_offset integer, p_limit integer, p_operation_id uuid, p_idempotency_key text)",
    "definitionHash": "c77ed3595bc2d33ddc51270c45f6e80e",
    "securityDefiner": true,
    "executeRoles": [
      "authenticated",
      "postgres"
    ],
    "root": true,
    "callerSignatures": []
  },
  {
    "signature": "private.v3_reconcile_confirmation_requirements_core(p_edition_id uuid, p_offset integer, p_limit integer)",
    "definitionHash": "d99e08867cf7ecffadcee7bc26e53d7d",
    "securityDefiner": true,
    "executeRoles": [
      "postgres"
    ],
    "root": false,
    "callerSignatures": [
      "public.studio2_reconcile_confirmation_requirements(p_edition_id uuid, p_offset integer, p_limit integer, p_operation_id uuid, p_idempotency_key text)"
    ]
  },
];

import type { InternalMechanismContract, InternalCallerContract } from './v3-s16-internal-mechanisms';
// Reviewed implementation fingerprints, not trigger-name exemptions. Runtime
// exposure, caller graph, attachment and table/column ACLs must independently pass.
export const V3_INTERNAL_MECHANISM_CONTRACTS: readonly InternalMechanismContract[] = [
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
  }
];
export const V3_INTERNAL_CALLER_CONTRACTS: readonly InternalCallerContract[] = [
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
  }
];

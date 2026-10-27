/** Audited consequence boundary; this does not relax transition authorization,
 * CAS, publication prerequisites, archival guards or event persistence. */
export const V3_EDITION_TRANSITION_CONSEQUENCE = {
  event: "edition.transitioned",
  canonicalState: "public.studio2_edition_runtime",
  command: "public.studio2_transition_edition_v3",
  role: "describes a synchronously committed versioned lifecycle transition",
  persistence: "private.v3_domain_events; public.studio2_contest_events; S2 operation outcome in the command transaction",
  asyncConsumers: [],
  requiredArchiveEffect: "edition.archived -> studio2_process_edition_domain_event -> studio2_reconcile_all_organizer_tasks",
  canonicalRead: "studio2_edition_runtime.state/version",
  missingMaturity: "additional dashboard/realtime/analytics consumers; no transition authority is delegated to them",
  releaseClass: "derived",
  evidence: [
    "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
    "supabase/migrations/20261019112300_v3_s14_transition_http409.sql",
    ".github/scripts/v3-s14-edition-event-vocabulary-rehearsal.sh",
    ".github/scripts/v3-s14-archive-system-rehearsal.sh",
  ],
} as const;

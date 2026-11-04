/** TG7 phase-one owner of formally submitted and procedurally registered measures. */
export const TERRA_GOVERNANCE_TG7 = Object.freeze({
  phase: "TG7" as const,
  status: "implementation" as const,
  dependsOn: ["TG1 country control", "TG2 world organizations and scoped grants", "TG6 sessions/agenda"] as const,
  migration: "20261104122000_v3_tg7_world_measures_submissions.sql",
  canonicalTables: [
    "public.world_measures",
    "public.world_measure_versions",
    "public.world_measure_categories",
    "public.world_measure_procedural_reviews",
  ] as const,
  commands: [
    "public.world_measure_submit_v1",
    "public.world_measure_review_v1",
    "public.world_measure_resubmit_v1",
  ] as const,
  projections: [
    "public.world_measure_public_list_v1",
    "public.world_measure_public_detail_v1",
    "public.world_measure_manage_v1",
  ] as const,
  events: [
    "world.measure.submitted",
    "world.measure.review_started",
    "world.measure.correction_requested",
    "world.measure.registered",
    "world.measure.resubmitted",
  ] as const,
  capabilities: [
    "world.measure.submit",
    "world.measure.register_external",
    "world.measure.review_procedural",
    "world.measure.schedule",
    "world.measure.withdraw",
    "world.amendment.submit",
  ] as const,
  sourceOfTruth: "TG2 organization/member eligibility and TG7 immutable measure/version records",
  notYetImplemented: [
    "historically verified GUARD topic-code seed",
    "external proposal intake with provenance and audit hash",
    "measure and amendment editors plus participant task projections",
    "agendas and scheduling of registered measures",
    "amendment incorporation, official voting and resolution certification",
  ] as const,
});


export const V3_RESULTS_INTEGRATION_CONTRACT = {
  schemaVersion: 1,
  contractVersion: "results-shared-v1",
  frozenImplementationOwner: "PR #1400",
  frozenHeadContext: "93760e5fd1923adea35688bd0e0ffe69dffbcaeb",
  sharedBranchMayImplementResultsMutationInternals: false,
  mutation: {
    semanticOperation: "results.calculate_official",
    authority: "governed server/database command owned by PR #1400",
    requires: [
      "atomic_official_televote_conversion",
      "canonical_results_recalculation",
      "countback_tiebreak_authority",
      "version_or_state_guard",
      "operation_readback_for_uncertain_outcome",
      "reconciliation",
    ],
  },
  publishedRead: {
    source: "immutable published result snapshot",
    requires: [
      "show_and_edition_identity",
      "result_version",
      "publication_version",
      "publication_visibility",
      "immutable_rows",
      "jury_and_televote_disclosure_flags",
    ],
    mutableResultsFallbackAllowed: false,
  },
  failure: {
    staleVersion: "fail_closed",
    publicationChangedDuringRead: "fail_closed_and_refresh",
    uncertainMutationOutcome: "reconcile_operation_before_retry",
    missingImmutablePublication: "unavailable_not_mutable_fallback",
  },
  handoff: {
    televoteToResults: "one atomic official conversion boundary",
    publicConsumption: "publication-safe immutable result version only",
  },
} as const;

export type V3ResultsIntegrationContract = typeof V3_RESULTS_INTEGRATION_CONTRACT;

export function validateV3ResultsIntegrationContract(contract: V3ResultsIntegrationContract) {
  const errors: string[] = [];
  if (contract.sharedBranchMayImplementResultsMutationInternals) errors.push("shared branch may not own frozen Results mutation internals");
  if (contract.publishedRead.mutableResultsFallbackAllowed) errors.push("published Results may not fall back to mutable rows");
  if (!contract.mutation.requires.includes("atomic_official_televote_conversion")) errors.push("atomic televote/result handoff missing");
  if (!contract.mutation.requires.includes("countback_tiebreak_authority")) errors.push("countback authority missing");
  if (!contract.mutation.requires.includes("operation_readback_for_uncertain_outcome")) errors.push("uncertain outcome readback missing");
  if (contract.failure.uncertainMutationOutcome !== "reconcile_operation_before_retry") errors.push("unsafe retry contract");
  return errors;
}

export type V3PublicResultsBaseTableDebt = {
  path: string;
  capability:
    | "explore"
    | "results"
    | "edition"
    | "result-lab"
    | "primary-surfaces"
    | "broadcast-intelligence";
  replacementAuthority: "v3_public_published_result_snapshot";
};

/**
 * Temporary, explicit release debt.
 *
 * These are the only Public V3 server adapters still allowed to read the mutable
 * `public.results` base table directly. Each entry must disappear as that
 * consumer moves to the exact immutable Result snapshot selected by canonical
 * Publication. Do not add entries to make a regression test pass. A new direct
 * Public read is a publication-boundary regression, not new architecture.
 */
export const V3_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_DEBT = [
  {
    path: "src/integrations/v3/explore-source.server.ts",
    capability: "explore",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
  {
    path: "src/integrations/v3/results-source.server.ts",
    capability: "results",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
  {
    path: "src/integrations/v3/edition-source.server.ts",
    capability: "edition",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
  {
    path: "src/integrations/v3/result-lab-source.server.ts",
    capability: "result-lab",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
  {
    path: "src/integrations/v3/primary-surface-source.server.ts",
    capability: "primary-surfaces",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
  {
    path: "src/integrations/v3/broadcast-intelligence-source.server.ts",
    capability: "broadcast-intelligence",
    replacementAuthority: "v3_public_published_result_snapshot",
  },
] as const satisfies readonly V3PublicResultsBaseTableDebt[];

/**
 * Non-Public result-table users are tracked separately so Public debt cannot be
 * hidden by broadening one generic allow-list. These paths are not evidence that
 * anon/authenticated base-table SELECT is safe; they merely belong to internal
 * system or Organizer flows and therefore have a different migration owner.
 */
export const V3_NON_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_ALLOWLIST = [
  "src/integrations/televoting/results-sync.server.ts",
  "src/routes/_authenticated/admin/voting-system/$slug.tsx",
  "src/components/admin/HeatProgressionSyncPanel.tsx",
] as const;

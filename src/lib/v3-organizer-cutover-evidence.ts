export type V3OrganizerEvidenceCutover = {
  id: string;
  route: string;
  ownerCapability: "edition.read";
  proofKind: "canonical-read" | "isolated-simulation" | "static-context";
  implementationPaths: readonly string[];
  authorityPaths: readonly string[];
  acceptanceTests: readonly string[];
};

/**
 * Evidence-only Organizer cutovers accepted by the S15 burndown worker.
 *
 * These rows are deliberately limited to controls that already have a complete
 * read/isolation authority story. Mutation-heavy controls stay out of this
 * registry until their canonical command/version/receipt contracts are proven.
 */
export const V3_ORGANIZER_EVIDENCE_CUTOVERS = [
  {
    id: "current-edition-overview",
    route: "/admin/operations",
    ownerCapability: "edition.read",
    proofKind: "canonical-read",
    implementationPaths: [
      "src/routes/_authenticated/admin/operations.tsx",
      "src/lib/v3-organizer-projection.query.ts",
      "src/lib/v3-organizer-projection.functions.ts",
      "src/lib/organizer-v3-projection.server.ts",
    ],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "src/lib/organizer-v3-projection.server.ts",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-projection.test.ts",
      "src/lib/v3-organizer-projection.contract.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "live-review-simulation-lab",
    route: "/admin/edition-simulator",
    ownerCapability: "edition.read",
    proofKind: "isolated-simulation",
    implementationPaths: [
      "src/routes/_authenticated/admin/edition-simulator.tsx",
      "src/lib/control-room.functions.ts",
      "src/lib/control-room.server.ts",
      "src/lib/edition-simulator.ts",
    ],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "src/lib/control-room.server.ts",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/edition-simulator.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "live-review-time-machine",
    route: "/admin/time-machine",
    ownerCapability: "edition.read",
    proofKind: "canonical-read",
    implementationPaths: [
      "src/routes/_authenticated/admin/time-machine.tsx",
      "supabase/migrations/20260920104806_completion_products.sql",
    ],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "supabase/migrations/20260920104806_completion_products.sql",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-time-machine-context.contract.test.ts",
      "src/lib/completion-products-security.integration.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "workspace-administration",
    route: "/admin/more",
    ownerCapability: "edition.read",
    proofKind: "static-context",
    implementationPaths: ["src/routes/_authenticated/admin/more.tsx"],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-workspace-building-evidence.contract.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "workspace-organizer-guide",
    route: "/admin/guide",
    ownerCapability: "edition.read",
    proofKind: "static-context",
    implementationPaths: ["src/routes/_authenticated/admin/guide.tsx"],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-workspace-building-evidence.contract.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "workspace-command-assistant",
    route: "/admin/command-assistant",
    ownerCapability: "edition.read",
    proofKind: "canonical-read",
    implementationPaths: [
      "src/routes/_authenticated/admin/command-assistant.tsx",
      "src/lib/solaris-command-assistant.ts",
      "src/lib/solaris-command-assistant-insights.ts",
      "src/lib/v3-organizer-projection.query.ts",
    ],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "src/lib/organizer-v3-projection.server.ts",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
    ],
    acceptanceTests: [
      "src/lib/solaris-command-assistant.test.ts",
      "src/lib/solaris-command-assistant-insights.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
] as const satisfies readonly V3OrganizerEvidenceCutover[];

export const V3_ORGANIZER_EVIDENCE_CUTOVER_IDS = new Set(
  V3_ORGANIZER_EVIDENCE_CUTOVERS.map((row) => row.id),
);

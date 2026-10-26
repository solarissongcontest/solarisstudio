export type V3OrganizerEvidenceCutover = {
  id: string;
  route: string;
  ownerCapability:
    | "edition.read"
    | "host.read"
    | "story.read"
    | "community.read"
    | "communications.read";
  proofKind:
    | "canonical-read"
    | "isolated-simulation"
    | "static-context"
    | "governed-operation";
  implementationPaths: readonly string[];
  authorityPaths: readonly string[];
  acceptanceTests: readonly string[];
};

/**
 * Item-specific evidence for Organizer capabilities that are already implemented
 * and can be accepted without inventing a new owner. Mutation-heavy rows are
 * included only where the existing server path proves a stricter manage/action
 * capability, version or operation identity where required, and authoritative
 * readback. Rows whose route-map capability is only shadow metadata stay out.
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
    id: "current-edition-host",
    route: "/admin/hosts",
    ownerCapability: "host.read",
    proofKind: "governed-operation",
    implementationPaths: [
      "src/routes/_authenticated/admin/hosts.tsx",
      "src/lib/studio2-host-management.ts",
    ],
    authorityPaths: [
      "supabase/migrations/20260912171500_studio2_host_management.sql",
      "supabase/migrations/20260915185524_permission_engine_v2_private_helper_cutover.sql",
    ],
    acceptanceTests: [
      "src/lib/studio2-host-management-integration.test.ts",
      "src/lib/v3-organizer-host-context.contract.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
  {
    id: "current-edition-storytelling",
    route: "/admin/storytelling",
    ownerCapability: "story.read",
    proofKind: "governed-operation",
    implementationPaths: [
      "src/routes/_authenticated/admin/storytelling.tsx",
      "src/lib/studio2-storytelling.ts",
    ],
    authorityPaths: [
      "supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql",
      "supabase/migrations/20260912194200_studio2_storytelling_hardening.sql",
      "supabase/migrations/20260915185524_permission_engine_v2_private_helper_cutover.sql",
    ],
    acceptanceTests: [
      "src/lib/studio2-storytelling-integration.test.ts",
      "src/lib/v3-organizer-storytelling-context.contract.test.ts",
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
    id: "workspace-community-moderation",
    route: "/admin/community-moderation",
    ownerCapability: "community.read",
    proofKind: "governed-operation",
    implementationPaths: ["src/routes/_authenticated/admin/community-moderation.tsx"],
    authorityPaths: [
      "supabase/migrations/20261002200000_organisation_os_v5_community_moderation.sql",
      "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-community-moderation-scope.contract.test.ts",
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
  {
    id: "operations-communications",
    route: "/admin/communications",
    ownerCapability: "communications.read",
    proofKind: "governed-operation",
    implementationPaths: [
      "src/routes/_authenticated/admin/communications.tsx",
      "src/lib/v3-organizer-communications-operations.ts",
      "src/lib/v3-official-communications-commands.ts",
      "src/lib/v3-official-communications-draft-commands.ts",
    ],
    authorityPaths: [
      "src/routes/_authenticated/admin/route.tsx",
      "supabase/migrations/20260914035152_permission_engine_v2_foundation.sql",
      "supabase/migrations/20261024235910_v3_official_communications_command_authority.sql",
      "supabase/migrations/20261024235920_v3_official_communications_draft_authority.sql",
    ],
    acceptanceTests: [
      "src/lib/v3-organizer-communications-operations.contract.test.ts",
      "src/lib/v3-organizer-communications-route-cutover.contract.test.ts",
      "src/lib/v3-organizer-evidence-cutover.contract.test.ts",
    ],
  },
] as const satisfies readonly V3OrganizerEvidenceCutover[];

export const V3_ORGANIZER_EVIDENCE_CUTOVER_IDS = new Set(
  V3_ORGANIZER_EVIDENCE_CUTOVERS.map((row) => row.id),
);

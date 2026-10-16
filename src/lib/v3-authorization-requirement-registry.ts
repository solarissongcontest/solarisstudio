import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

export type V3AuthorizationScope = "global" | "edition" | "show" | "object";
export type V3AuthorizationState = "declared" | "verified";

export type V3AuthorizationRequirement = {
  command: string;
  ownerDomain: string;
  state: V3AuthorizationState;
  requiredCapability: string | null;
  scope: V3AuthorizationScope | null;
  objectResolution: string | null;
  serverBoundary: string | null;
  serviceRoleAllowed: boolean | null;
  negativePaths: readonly string[];
  evidence: readonly string[];
};

type VerifiedAuthorization = Omit<
  V3AuthorizationRequirement,
  "command" | "ownerDomain" | "state"
>;

const VERIFIED: Readonly<Record<string, VerifiedAuthorization>> = {
  "entry.review": {
    requiredCapability: "confirmation.manage",
    scope: "object",
    objectResolution: "entry -> submission -> edition",
    serverBoundary: "public.studio2_apply_confirmation_entry_review",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "wrong edition",
      "unknown entry",
      "stale review version",
    ],
    evidence: [
      "public.studio2_apply_confirmation_entry_review live function inspection",
      "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
    ],
  },
  "entry.request_changes": {
    requiredCapability: "confirmation.manage",
    scope: "object",
    objectResolution: "entry -> submission -> edition",
    serverBoundary: "public.studio2_apply_confirmation_entry_review",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "wrong edition",
      "unknown entry",
      "stale review version",
    ],
    evidence: [
      "public.studio2_apply_confirmation_entry_review live function inspection",
      "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
    ],
  },
  "jury.open": {
    requiredCapability: "voting.manage",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_apply_jury_voting_status",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale jury-window version",
    ],
    evidence: [
      "public.studio2_apply_jury_voting_status live function inspection",
      "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    ],
  },
  "jury.close": {
    requiredCapability: "voting.manage",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_apply_jury_voting_status",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale jury-window version",
    ],
    evidence: [
      "public.studio2_apply_jury_voting_status live function inspection",
      "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    ],
  },
  "results.calculate": {
    requiredCapability: "results.verify",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_execute_result_operation",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale calculation version",
    ],
    evidence: ["public.studio2_execute_result_operation live function inspection"],
  },
  "results.verify": {
    requiredCapability: "results.verify",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_execute_result_operation",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale calculation version",
    ],
    evidence: ["public.studio2_execute_result_operation live function inspection"],
  },
  "results.lock": {
    requiredCapability: "results.verify",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_execute_result_operation",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale calculation version",
    ],
    evidence: ["public.studio2_execute_result_operation live function inspection"],
  },
  "results.unlock": {
    requiredCapability: "results.verify",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_execute_result_operation",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "show outside authorized edition",
      "unknown show",
      "stale calculation version",
    ],
    evidence: ["public.studio2_execute_result_operation live function inspection"],
  },
};

const commandOwners = new Map<string, string[]>();
for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
  for (const command of domain.mutationCommands) {
    const owners = commandOwners.get(command) ?? [];
    owners.push(domain.domain);
    commandOwners.set(command, owners);
  }
}

export const V3_AUTHORIZATION_REQUIREMENT_REGISTRY: readonly V3AuthorizationRequirement[] =
  [...commandOwners.entries()]
    .map(([command, owners]) => {
      const verified = VERIFIED[command];
      return {
        command,
        ownerDomain: owners[0] ?? "unknown",
        state: verified ? "verified" : "declared",
        requiredCapability: verified?.requiredCapability ?? null,
        scope: verified?.scope ?? null,
        objectResolution: verified?.objectResolution ?? null,
        serverBoundary: verified?.serverBoundary ?? null,
        serviceRoleAllowed: verified?.serviceRoleAllowed ?? null,
        negativePaths: verified?.negativePaths ?? [],
        evidence: verified?.evidence ?? [],
      } satisfies V3AuthorizationRequirement;
    })
    .sort((left, right) => left.command.localeCompare(right.command));

// Open defects only. The previously confirmed country-entry participant/edition
// confusion was repaired by the exact-object authorization migration in #615.
export const V3_AUTHORIZATION_KNOWN_GAPS = [] as const;

export const V3_AUTHORIZATION_RESOLVED_GAPS = [
  {
    id: "country-entry-participant-edition-confusion",
    functions: [
      "public.admin_upsert_country_entry",
      "public.admin_update_country_entry_listen_links",
    ] as const,
    capability: "entry.edit",
    defect:
      "authorization formerly checked caller-supplied edition before internal writers derived the actual target edition from participant_id",
    resolution:
      "resolve participant target edition first, require supplied edition to match it, then authorize entry.edit against that authoritative edition",
    status: "fixed" as const,
    evidence: [
      "supabase/migrations/20261016070000_v3_s7_entry_object_authorization.sql",
      "src/lib/v3-s7-entry-object-authorization.contract.test.ts",
      ".github/scripts/v3-s7-entry-object-authorization-rehearsal.sh",
    ],
  },
] as const;

export function v3AuthorizationRequirement(command: string) {
  return V3_AUTHORIZATION_REQUIREMENT_REGISTRY.find((item) => item.command === command) ?? null;
}

export function validateV3AuthorizationRequirementRegistry() {
  const errors: string[] = [];
  const knownDomains = new Set(V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain));
  const allCommands = V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.mutationCommands);
  const uniqueCommands = new Set(allCommands);
  const seen = new Set<string>();

  for (const [command, owners] of commandOwners) {
    if (new Set(owners).size !== 1) {
      errors.push(`${command} has competing canonical owners: ${[...new Set(owners)].join(", ")}`);
    }
  }

  for (const requirement of V3_AUTHORIZATION_REQUIREMENT_REGISTRY) {
    if (seen.has(requirement.command)) errors.push(`duplicate command ${requirement.command}`);
    seen.add(requirement.command);
    if (!knownDomains.has(requirement.ownerDomain)) {
      errors.push(`${requirement.command} has unknown owner domain ${requirement.ownerDomain}`);
    }
    if (requirement.state === "verified") {
      if (!requirement.requiredCapability) errors.push(`${requirement.command} is verified without a capability`);
      if (!requirement.scope) errors.push(`${requirement.command} is verified without an authorization scope`);
      if (!requirement.objectResolution) errors.push(`${requirement.command} is verified without object resolution`);
      if (!requirement.serverBoundary) errors.push(`${requirement.command} is verified without a server boundary`);
      if (requirement.serviceRoleAllowed === null) errors.push(`${requirement.command} is verified without a service-role decision`);
      if (requirement.negativePaths.length < 3) errors.push(`${requirement.command} lacks hostile negative-path coverage requirements`);
      if (!requirement.evidence.length) errors.push(`${requirement.command} is verified without evidence`);
    }
  }

  if (seen.size !== uniqueCommands.size) {
    errors.push(`authorization registry covers ${seen.size} commands but System registry declares ${uniqueCommands.size}`);
  }
  for (const command of uniqueCommands) {
    if (!seen.has(command)) errors.push(`unregistered mutation command ${command}`);
  }
  for (const command of Object.keys(VERIFIED)) {
    if (!uniqueCommands.has(command)) errors.push(`verified authorization contract references unknown command ${command}`);
  }

  return errors;
}

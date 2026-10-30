import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

export type V3AuthorizationScope = "global" | "edition" | "show" | "object";
export type V3AuthorizationState = "declared" | "verified";
export type V3AuthorizationModel = "capability" | "participant-boundary";

export type V3AuthorizationRequirement = {
  command: string;
  ownerDomain: string;
  state: V3AuthorizationState;
  authorizationModel: V3AuthorizationModel | null;
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
> & { authorizationModel: V3AuthorizationModel };

const CAPABILITY_MODEL = "capability" as const;

const VERIFIED: Readonly<Record<string, VerifiedAuthorization>> = {
  "confirmation.submit": {
    authorizationModel: "participant-boundary",
    requiredCapability: null,
    scope: "object",
    objectResolution:
      "payload round_id -> round; edit token -> submission -> same round; browser session + idempotency key -> one operation",
    serverBoundary: "public.v3_submit_confirmation",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing or unknown round",
      "closed or full round",
      "invalid or expired edit token",
      "edit token submission belongs to another round",
      "locked or non-editable existing response",
      "browser-session mismatch or idempotency collision",
    ],
    evidence: [
      "supabase/migrations/20261016193700_v3_entry_credits_contract.sql",
      "supabase/migrations/20261015183100_v3_confirmation_submit_runtime_replay_restore.sql",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
      "src/lib/v3-s7-confirmation-round-authorization.contract.test.ts",
    ],
  },
  "confirmation.open": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "confirmation.manage",
    scope: "object",
    objectResolution: "round -> edition",
    serverBoundary: "public.studio2_apply_confirmation_round_change",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "round outside authorized edition",
      "unknown round",
      "stale round version",
    ],
    evidence: [
      "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
      "src/lib/v3-s7-confirmation-round-authorization.contract.test.ts",
    ],
  },
  "confirmation.close": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "confirmation.manage",
    scope: "object",
    objectResolution: "round -> edition",
    serverBoundary: "public.studio2_apply_confirmation_round_change",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "round outside authorized edition",
      "unknown round",
      "stale round version",
    ],
    evidence: [
      "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
      "src/lib/v3-s7-confirmation-round-authorization.contract.test.ts",
    ],
  },
  "confirmation.grant_edit": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "confirmation.manage",
    scope: "object",
    objectResolution: "round -> edition",
    serverBoundary: "public.studio2_apply_confirmation_round_change",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "round outside authorized edition",
      "unknown round",
      "stale round version",
    ],
    evidence: [
      "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
      ".github/scripts/v3-s14-stage-3-confirmations.sh",
      "src/lib/v3-s7-confirmation-round-authorization.contract.test.ts",
    ],
  },
  "participation.override": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "entry.approve",
    scope: "edition",
    objectResolution:
      "caller edition + exactly one country or contest entity subject; preview/apply and primitive writes remain constrained to that edition",
    serverBoundary: "public.studio2_apply_participation_status",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "missing or invalid edition",
      "zero or two participation subjects",
      "unknown participation record",
      "stale participation version",
      "invalid target status",
    ],
    evidence: [
      "supabase/migrations/20261003015000_organisation_os_v5_participation_status_operations.sql",
      "supabase/migrations/20260916035015_permission_engine_v2_operational_admin_rpc_cutover.sql",
      ".github/scripts/v3-s14-stage-4-entries.sh",
      "src/lib/v3-s7-participation-authorization.contract.test.ts",
    ],
  },
  "next_in_line.open": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "next_in_line.manage",
    scope: "edition",
    objectResolution: "edition -> one versioned Next in Line window",
    serverBoundary: "public.studio2_apply_next_in_line_window_change",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "unknown edition",
      "invalid lifecycle transition",
      "stale window version",
      "expired or invalid time window",
      "missing operator reason",
    ],
    evidence: [
      "supabase/migrations/20261003183000_organisation_os_v5_next_in_line_runtime.sql",
      "src/lib/organisation-v5-next-in-line-runtime.test.ts",
      "src/lib/v3-s7-next-in-line-window-authorization.contract.test.ts",
    ],
  },
  "next_in_line.close": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "next_in_line.manage",
    scope: "edition",
    objectResolution: "edition -> one versioned Next in Line window",
    serverBoundary: "public.studio2_apply_next_in_line_window_change",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "unknown edition",
      "invalid lifecycle transition",
      "stale window version",
      "invalid time window",
      "missing operator reason",
    ],
    evidence: [
      "supabase/migrations/20261003183000_organisation_os_v5_next_in_line_runtime.sql",
      "src/lib/organisation-v5-next-in-line-runtime.test.ts",
      "src/lib/v3-s7-next-in-line-window-authorization.contract.test.ts",
    ],
  },
  "entry.review": {
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
  "jury.ballot_review": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "jury.ballots.manage",
    scope: "object",
    objectResolution: "ballot -> edition",
    serverBoundary: "public.studio2_apply_jury_ballot_review",
    serviceRoleAllowed: false,
    negativePaths: [
      "missing capability",
      "unknown ballot",
      "invalid ballot lifecycle transition",
      "stale ballot review version",
      "missing reason for adverse transition",
    ],
    evidence: [
      "supabase/migrations/20261029234500_v3_jury_command_recovery_boundary.sql",
      ".github/tests/v3-jury-runtime-mechanisms.sql",
      "supabase/migrations/20261003193000_organisation_os_v5_jury_ballot_lifecycle.sql",
      "src/lib/organisation-v5-jury-ballot-lifecycle.test.ts",
      "src/lib/v3-s7-jury-ballot-authorization.contract.test.ts",
    ],
  },
  "jury.dnv": {
    authorizationModel: CAPABILITY_MODEL,
    requiredCapability: "jury.ballots.manage",
    scope: "object",
    objectResolution: "show -> edition; show + jury identity -> one DNV absence record",
    serverBoundary: "public.studio2_apply_jury_dnv",
    serviceRoleAllowed: true,
    negativePaths: [
      "missing capability",
      "unknown show",
      "missing jury identity",
      "saved-vote conflict",
      "stale DNV version",
      "missing operator reason",
      "unknown DNV action",
    ],
    evidence: [
      "supabase/migrations/20261003193000_organisation_os_v5_jury_ballot_lifecycle.sql",
      "src/lib/organisation-v5-jury-ballot-lifecycle.test.ts",
      "src/lib/v3-s7-jury-ballot-authorization.contract.test.ts",
    ],
  },
  "results.calculate": {
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
    authorizationModel: CAPABILITY_MODEL,
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
        authorizationModel: verified?.authorizationModel ?? null,
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
      if (!requirement.authorizationModel) {
        errors.push(`${requirement.command} is verified without an authorization model`);
      }
      if (requirement.authorizationModel === "capability" && !requirement.requiredCapability) {
        errors.push(`${requirement.command} uses capability authorization without a capability`);
      }
      if (
        requirement.authorizationModel === "participant-boundary" &&
        requirement.requiredCapability !== null
      ) {
        errors.push(`${requirement.command} participant authorization must not impersonate an Organizer capability`);
      }
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

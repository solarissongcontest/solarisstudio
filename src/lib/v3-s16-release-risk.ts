import type {
  V3S16CatalogEvidence,
  V3S16Finding,
  V3S16Report,
  V3S16SourceFile,
} from "./v3-s16-mutation-authority";

export type V3S16ReleaseRisk = "hard_blocker" | "conditional_blocker";

export type V3S16ClassifiedFinding = Omit<V3S16Finding, "kind" | "releaseRisk"> & {
  kind: V3S16Finding["kind"] | "canonical_command_inventory_missing" | "legacy_application_writer";
  releaseRisk: V3S16ReleaseRisk;
  rule: string;
};

export type V3S16AuthorityContract = {
  domain: string;
  canonicalCommands: readonly string[];
  evidence: readonly string[];
  ownerBoundary?: "shared" | "results_pr_1400";
  legacyApplicationWriters?: readonly {
    id: string;
    pattern: RegExp;
    rationale: string;
  }[];
};

export const V3_S16_AUTHORITY_CONTRACTS: readonly V3S16AuthorityContract[] = [
  {
    domain: "results",
    canonicalCommands: [],
    ownerBoundary: "results_pr_1400",
    evidence: ["src/lib/v3-results-integration-contract.ts"],
  },
  {
    domain: "jury",
    canonicalCommands: [
      "public.v3_submit_jury_ballot",
      "public.studio2_apply_jury_voting_status",
    ],
    evidence: [
      "supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql",
      "supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql",
      "src/integrations/v3/jury-actions.server.ts",
      "src/components/admin/JuryVotingWindowControl.tsx",
    ],
    legacyApplicationWriters: [
      {
        id: "browser-direct-submit_country_jury_ballot",
        pattern: /\.rpc\(\s*["']submit_country_jury_ballot["']/,
        rationale:
          "The participant browser can still bypass the V3 operation/receipt wrapper when the reliability rollout is disabled.",
      },
    ],
  },
  {
    domain: "publication",
    canonicalCommands: [
      "public.studio2_apply_show_publication_change",
      "public.studio2_publish_due_show_publications",
    ],
    evidence: [
      "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
      "supabase/migrations/20261015164100_v3_s3_publication_invariants.sql",
      "supabase/migrations/20261016060000_v3_s5_publication_consequences.sql",
      "src/lib/show-publication-lifecycle.ts",
    ],
  },
];

function browserFacingRole(detail: string) {
  const normalized = detail.toLowerCase();
  return ["anon", "authenticated", "public"].some((role) =>
    new RegExp(`(?:^|[^a-z_])${role}(?:$|[^a-z_])`).test(normalized),
  );
}

function classifyBaseFinding(finding: V3S16Finding): V3S16ClassifiedFinding {
  if (
    (finding.kind === "unexpected_direct_dml_role" || finding.kind === "unexpected_column_dml_role") &&
    !browserFacingRole(finding.detail) &&
    /service_role/i.test(finding.detail)
  ) {
    return {
      ...finding,
      releaseRisk: "conditional_blocker",
      rule: "service_role_write_requires_explicit_operational_classification",
    };
  }
  if (finding.kind === "unexpected_write_trigger") {
    return {
      ...finding,
      releaseRisk: "conditional_blocker",
      rule: "trigger_write_path_requires_owner_classification",
    };
  }
  return {
    ...finding,
    releaseRisk: "hard_blocker",
    rule: finding.kind,
  };
}

function productionFiles(files: readonly V3S16SourceFile[]) {
  return files.filter((file) =>
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.path) &&
    !file.path.includes("/fixtures/") &&
    !file.path.startsWith("supabase/migrations/") &&
    !file.path.startsWith(".github/tests/"),
  );
}

function safeSearchPath(value: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  return normalized.includes("pg_catalog") && !normalized.includes("$user");
}

function catalogCommandFindings(
  contract: V3S16AuthorityContract,
  catalog: V3S16CatalogEvidence,
): V3S16ClassifiedFinding[] {
  const findings: V3S16ClassifiedFinding[] = [];
  for (const command of contract.canonicalCommands) {
    const bare = command.split(".").at(-1)!;
    const fn = catalog.functions.find((candidate) =>
      candidate.name === command || candidate.name === bare || candidate.name === `public.${bare}` || candidate.name === `private.${bare}`,
    );
    if (!fn) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_missing",
        subject: command,
        detail: `Declared canonical mutation command ${command} is absent from exact-SHA catalog evidence.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "declared_canonical_command_must_exist",
      });
      continue;
    }
    if (!fn.securityDefiner) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_not_security_definer",
        subject: command,
        detail: `Declared canonical mutation command ${command} is not SECURITY DEFINER.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "canonical_command_owns_revoked_table_boundary",
      });
    }
    if (!safeSearchPath(fn.searchPath)) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_unpinned_search_path",
        subject: command,
        detail: `Declared canonical mutation command ${command} lacks a pinned search_path containing pg_catalog.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "security_definer_search_path_must_be_pinned",
      });
    }
    if (fn.executeRoles.some((role) => role.toLowerCase() === "public")) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_public_execute",
        subject: command,
        detail: `Declared canonical mutation command ${command} is executable by PUBLIC.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "canonical_command_must_revoke_public_execute",
      });
    }
  }
  return findings;
}

export function classifyV3S16ReleaseAuthority(input: {
  baseFindings: readonly V3S16Finding[];
  domains: V3S16Report["domains"];
  files: readonly V3S16SourceFile[];
  catalog?: V3S16CatalogEvidence | null;
  staticOnly?: boolean;
}) {
  const findings: V3S16ClassifiedFinding[] = input.baseFindings.map(classifyBaseFinding);
  const contracts = new Map(V3_S16_AUTHORITY_CONTRACTS.map((contract) => [contract.domain, contract]));

  for (const domain of input.domains) {
    if (domain.ownerBoundary === "results_pr_1400") continue;
    const contract = contracts.get(domain.id);
    if (!contract?.canonicalCommands.length) {
      findings.push({
        domain: domain.id,
        kind: "canonical_command_inventory_missing",
        subject: domain.id,
        detail: `S16 has not yet declared the canonical mutation command inventory for ${domain.id}.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: "shared",
        rule: "critical_mutation_owner_requires_explicit_command_inventory",
      });
      continue;
    }

    for (const legacy of contract.legacyApplicationWriters ?? []) {
      for (const file of productionFiles(input.files)) {
        legacy.pattern.lastIndex = 0;
        if (!legacy.pattern.test(file.source)) continue;
        findings.push({
          domain: domain.id,
          kind: "legacy_application_writer",
          subject: legacy.id,
          path: file.path,
          detail: legacy.rationale,
          releaseRisk: "hard_blocker",
          ownerBoundary: contract.ownerBoundary ?? "shared",
          rule: "legacy_application_writer_must_be_unreachable",
        });
      }
    }

    if (!input.staticOnly && input.catalog) {
      findings.push(...catalogCommandFindings(contract, input.catalog));
    }
  }

  const unique = [...new Map(findings.map((finding) => [
    [finding.domain, finding.kind, finding.subject, finding.path ?? "", finding.detail].join("\u0000"),
    finding,
  ])).values()];
  const hardBlockers = unique.filter((finding) => finding.releaseRisk === "hard_blocker").length;
  const conditionalBlockers = unique.filter((finding) => finding.releaseRisk === "conditional_blocker").length;
  return {
    findings: unique,
    riskTotals: {
      hard_blocker: hardBlockers,
      conditional_blocker: conditionalBlockers,
    },
    s16Passed: !input.staticOnly && unique.length === 0,
  };
}

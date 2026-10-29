import { describe, expect, it } from "vitest";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";
import type { V3S16Finding, V3S16Report } from "./v3-s16-mutation-authority";

const domains: V3S16Report["domains"] = [
  {
    id: "results",
    sanctionedCrossDomainWriters: [],
    temporaryCompatibilityApplicationWriters: [],
    allowedColumnDmlGrants: [],
    canonicalOwner: "Results / PR #1400",
    canonicalTables: ["public.results"],
    canonicalCommands: [],
    sanctionedInternalWriters: [],
    sanctionedWriteTriggers: [],
    ownerBoundary: "results_pr_1400",
  },
  {
    id: "jury",
    sanctionedCrossDomainWriters: [],
    temporaryCompatibilityApplicationWriters: [],
    allowedColumnDmlGrants: [],
    canonicalOwner: "jury",
    canonicalTables: ["public.jury_votes"],
    canonicalCommands: ["v3_submit_jury_ballot", "studio2_apply_jury_voting_status"],
    sanctionedInternalWriters: ["submit_country_jury_ballot"],
    sanctionedWriteTriggers: [],
    ownerBoundary: "shared",
  },
  {
    id: "publication",
    sanctionedCrossDomainWriters: [],
    temporaryCompatibilityApplicationWriters: [],
    allowedColumnDmlGrants: [],
    canonicalOwner: "publication",
    canonicalTables: ["public.studio2_show_publication_controls"],
    canonicalCommands: ["studio2_apply_show_publication_change", "studio2_publish_due_show_publications"],
    sanctionedInternalWriters: ["studio2_create_show_publication_control", "studio2_ensure_show_publication_control"],
    sanctionedWriteTriggers: ["v3_validate_publication_control"],
    ownerBoundary: "shared",
  },
  {
    id: "entry",
    sanctionedCrossDomainWriters: [],
    temporaryCompatibilityApplicationWriters: [],
    allowedColumnDmlGrants: [],
    canonicalOwner: "entry",
    canonicalTables: ["public.entries"],
    canonicalCommands: [],
    sanctionedInternalWriters: [],
    sanctionedWriteTriggers: [],
    ownerBoundary: "shared",
  },
];

function base(kind: V3S16Finding["kind"], detail: string): V3S16Finding {
  return {
    domain: "jury",
    kind,
    subject: "public.jury_votes",
    detail,
    releaseRisk: "hard_blocker",
    ownerBoundary: "shared",
  };
}

describe("S16 release-risk classification", () => {
  it("keeps browser-facing direct DML a hard blocker", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [base("unexpected_direct_dml_role", "Direct DML remains granted to authenticated, service_role.")],
      domains: domains.slice(0, 2),
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unexpected_direct_dml_role", releaseRisk: "hard_blocker" }),
    ]));
  });

  it("fails closed on unclassified service-role DML and trigger paths in critical domains", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [
        base("unexpected_direct_dml_role", "Direct DML remains granted to service_role."),
        base("unexpected_write_trigger", "Write trigger jury_guard can mutate or redirect critical state."),
      ],
      domains: domains.slice(0, 2),
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unexpected_direct_dml_role", releaseRisk: "hard_blocker" }),
      expect.objectContaining({ kind: "unexpected_write_trigger", releaseRisk: "hard_blocker" }),
    ]));
  });

  it("fails closed when a critical domain has no explicit canonical command inventory", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains: [...domains, { ...domains[3], id: "unknown-critical-domain" }],
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "unknown-critical-domain",
        kind: "canonical_command_inventory_missing",
        releaseRisk: "hard_blocker",
      }),
    ]));
    expect(result.findings.some((finding) => finding.domain === "publication" && finding.kind === "canonical_command_inventory_missing")).toBe(false);
    expect(result.findings.some((finding) => finding.domain === "results" && finding.kind === "canonical_command_inventory_missing")).toBe(false);
  });

  it("detects the Jury browser legacy writer while accepting the declared Jury command inventory", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains: domains.slice(0, 2),
      files: [{
        path: "src/routes/jury-voting.tsx",
        source: 'await supabase.rpc("submit_country_jury_ballot", { _show_id: showId })',
      }],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "jury",
        kind: "legacy_application_writer",
        subject: "browser-direct-submit_country_jury_ballot",
        releaseRisk: "hard_blocker",
      }),
    ]));
    expect(result.findings.some((finding) => finding.domain === "jury" && finding.kind === "canonical_command_inventory_missing")).toBe(false);
  });

  it("requires declared Jury commands to exist and retain hardened SECURITY DEFINER contracts in catalog proof", () => {
    const sha = "a".repeat(40);
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains: domains.slice(0, 2),
      files: [],
      catalog: {
        schemaVersion: 1,
        candidateSha: sha,
        tables: [],
        functions: [
          {
            name: "public.v3_submit_jury_ballot",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private",
            executeRoles: ["authenticated", "service_role"],
          },
          {
            name: "public.studio2_apply_jury_voting_status",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private",
            executeRoles: ["authenticated", "service_role"],
          },
          {
            name: "public.studio2_apply_jury_ballot_review",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private, pg_temp",
            executeRoles: ["authenticated"],
          },
          {
            name: "public.studio2_apply_jury_vote_change",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private, pg_temp",
            executeRoles: ["authenticated"],
          },
        ],
      },
      staticOnly: false,
    });
    expect(result.findings).toEqual([]);
    expect(result.riskTotals).toEqual({ hard_blocker: 0, conditional_blocker: 0 });
    expect(result.s16Passed).toBe(true);
  });

  it("accepts the interactive and scheduled Publication writers as one explicit authority inventory", () => {
    const sha = "b".repeat(40);
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains: [domains[2]],
      files: [],
      catalog: {
        schemaVersion: 1,
        candidateSha: sha,
        tables: [],
        functions: [
          {
            name: "public.studio2_apply_show_publication_change",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private",
            executeRoles: ["authenticated", "service_role"],
          },
          {
            name: "public.studio2_publish_due_show_publications",
            owner: "postgres",
            securityDefiner: true,
            searchPath: "pg_catalog, public, private",
            executeRoles: ["service_role"],
          },
        ],
      },
      staticOnly: false,
    });
    expect(result.findings).toEqual([]);
    expect(result.s16Passed).toBe(true);
  });
});

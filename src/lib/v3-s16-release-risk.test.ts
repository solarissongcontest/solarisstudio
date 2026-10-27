import { describe, expect, it } from "vitest";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";
import type { V3S16Finding, V3S16Report } from "./v3-s16-mutation-authority";

const domains: V3S16Report["domains"] = [
  {
    id: "results",
    canonicalOwner: "Results / PR #1400",
    canonicalTables: ["public.results"],
    canonicalCommands: [],
    ownerBoundary: "results_pr_1400",
  },
  {
    id: "jury",
    canonicalOwner: "jury",
    canonicalTables: ["public.jury_votes"],
    canonicalCommands: [],
    ownerBoundary: "shared",
  },
  {
    id: "publication",
    canonicalOwner: "publication",
    canonicalTables: ["public.studio2_show_publication_controls"],
    canonicalCommands: [],
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

  it("classifies service-role-only DML and trigger paths as conditional until their operational owner is proven", () => {
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
      expect.objectContaining({ kind: "unexpected_direct_dml_role", releaseRisk: "conditional_blocker" }),
      expect.objectContaining({ kind: "unexpected_write_trigger", releaseRisk: "conditional_blocker" }),
    ]));
  });

  it("fails closed when a critical domain has no explicit canonical command inventory", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains,
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "publication",
        kind: "canonical_command_inventory_missing",
        releaseRisk: "hard_blocker",
      }),
    ]));
    expect(result.findings.some((finding) => finding.domain === "results" && finding.kind === "canonical_command_inventory_missing")).toBe(false);
  });

  it("detects the still-reachable Jury browser legacy writer while accepting the declared Jury command inventory", () => {
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
        ],
      },
      staticOnly: false,
    });
    expect(result.findings).toEqual([]);
    expect(result.riskTotals).toEqual({ hard_blocker: 0, conditional_blocker: 0 });
    expect(result.s16Passed).toBe(true);
  });
});

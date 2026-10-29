import { describe, expect, it } from "vitest";
import { buildV3S16FindingLedger } from "../../scripts/lib/v3-s16-finding-ledger";
import type { V3S16CatalogEvidence, V3S16Finding, V3S16Report } from "./v3-s16-mutation-authority";
import type { V3S16ClassifiedFinding } from "./v3-s16-release-risk";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";

const sha = "a".repeat(40);
const inventory = {
  canonicalCommands: [],
  sanctionedInternalWriters: [],
  sanctionedCrossDomainWriters: [],
  sanctionedWriteTriggers: [],
  temporaryCompatibilityApplicationWriters: [],
  allowedColumnDmlGrants: [],
};
const domains: V3S16Report["domains"] = [
  {
    ...inventory,
    id: "results",
    canonicalOwner: "Results / PR #1400",
    canonicalTables: ["public.results"],
    ownerBoundary: "results_pr_1400",
  },
  {
    ...inventory,
    id: "entry",
    canonicalOwner: "Entry",
    canonicalTables: ["public.entries"],
    ownerBoundary: "shared",
  },
];
const raw: V3S16Finding[] = [
  {
    domain: "results",
    kind: "direct_application_writer",
    subject: "public.results",
    path: "src/results.ts",
    detail: "Direct writer",
    releaseRisk: "hard_blocker",
    ownerBoundary: "results_pr_1400",
  },
  {
    domain: "entry",
    kind: "unexpected_write_trigger",
    subject: "touch_entry",
    detail: "Unproven trigger",
    releaseRisk: "hard_blocker",
    ownerBoundary: "shared",
  },
];
const classified = raw.map((f) => ({ ...f, rule: f.kind })) as V3S16ClassifiedFinding[];
const catalog: V3S16CatalogEvidence = {
  schemaVersion: 1,
  candidateSha: sha,
  tables: [
    {
      table: "public.entries",
      owner: "postgres",
      rlsEnabled: true,
      dmlRoles: ["postgres"],
      columnDmlGrants: [],
      triggerDefinitions: [
        {
          name: "touch_entry",
          functionSignature: "private.touch()",
          functionOid: "1",
          type: 23,
          enabled: "O",
        },
      ],
    },
  ],
  functions: [
    {
      name: "private.touch",
      signature: "private.touch()",
      oid: "1",
      definitionHash: "b".repeat(32),
      owner: "postgres",
      searchPath: "pg_catalog, public, pg_temp",
      securityDefiner: true,
      executeRoles: ["postgres"],
      callers: [],
      writesTables: ["public.entries"],
    },
  ],
};
function ledger(overrides: Partial<Parameters<typeof buildV3S16FindingLedger>[0]> = {}) {
  return buildV3S16FindingLedger({
    candidateSha: sha,
    raw,
    classified,
    domains,
    catalog,
    files: [
      {
        path: "src/results.ts",
        source:
          'async function persist() {\n  const response = await db.from("results")\n    .insert([{ score: 12 }]);\n  return response;\n}',
      },
    ],
    catalogReference: "catalog.json",
    ...overrides,
  });
}
describe("one reconciled S16 finding ledger", () => {
  it("keeps identically named triggers on different tables as distinct findings", () => {
    const triggers = ["public.entries", "public.internal_entries"].map((mutationTarget) => ({
      ...raw[1],
      mutationTarget,
    }));
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: triggers,
      domains,
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toHaveLength(2);
    const inventory = ledger({ raw: triggers, classified: result.findings });
    expect(inventory.reconciled).toBe(true);
    expect(inventory.findings).toHaveLength(2);
    expect(new Set(inventory.findings.map((f) => f.finding_id)).size).toBe(2);
    expect(inventory.findings.map((f) => f.mutation_target).sort()).toEqual([
      ["public.entries"],
      ["public.internal_entries"],
    ]);
    expect(inventory.summary.raw_duplicates).toBe(0);
  });
  it("keeps overloaded writer signatures distinct even when names and messages match", () => {
    const functions = ["private.writer(p_id uuid)", "private.writer(p_id uuid, p_reason text)"].map(
      (objectSignature) => ({
        ...raw[1],
        kind: "competing_legacy_writer" as const,
        subject: "private.writer",
        objectSignature,
      }),
    );
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: functions,
      domains,
      files: [],
      staticOnly: true,
    });
    expect(result.findings).toHaveLength(2);
    expect(ledger({ raw: functions, classified: result.findings }).findings).toHaveLength(2);
  });
  it("distinguishes source, runtime, Results and shared while preserving every blocker", () => {
    const result = ledger();
    expect(result.reconciled).toBe(true);
    expect(result.summary).toEqual({
      raw_total: 2,
      raw_source: 1,
      raw_runtime: 1,
      raw_duplicates: 0,
      supplemental_release_findings: 0,
      classified_total: 2,
      classified_results_owned: 1,
      classified_shared: 1,
      unexplained: 0,
      conditional: 0,
    });
    expect(
      result.findings.every(
        (f) => f.proof_status === "unresolved" && f.release_risk === "hard_blocker",
      ),
    ).toBe(true);
    const source = result.findings.find((f) => f.source_location)!;
    expect(source.source_location).toEqual({
      path: "src/results.ts",
      mutations: [{ line: 3, type: "insert", caller: "persist" }],
    });
    expect(source.disposition).toBe("resolve_in_pr_1400");
    expect(source.mutation_target).toEqual(["public.results"]);
  });
  it("keeps identities stable across catalog ordering and binds fingerprints to actual ACL and code", () => {
    const first = ledger();
    const changed = structuredClone(catalog);
    changed.functions[0].executeRoles = [...changed.functions[0].executeRoles, "service_role"];
    const second = ledger({ catalog: changed });
    const before = first.findings.find((f) => f.domain === "entry")!;
    const after = second.findings.find((f) => f.domain === "entry")!;
    expect(after.finding_id).toBe(before.finding_id);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(
      ledger({ raw: [...raw].reverse(), classified: [...classified].reverse() }).findings.map(
        (f) => f.finding_id,
      ),
    ).toEqual(first.findings.map((f) => f.finding_id));
  });
  it("accounts explicitly for raw duplicates and supplemental release findings", () => {
    const supplemental: V3S16ClassifiedFinding = {
      ...classified[1],
      kind: "canonical_function_missing",
      subject: "public.command",
      detail: "Missing command",
    };
    const result = ledger({ raw: [...raw, raw[0]], classified: [...classified, supplemental] });
    expect(result.reconciled).toBe(true);
    expect(result.summary.raw_total).toBe(3);
    expect(result.summary.raw_duplicates).toBe(1);
    expect(result.summary.supplemental_release_findings).toBe(1);
    expect(result.summary.classified_total).toBe(3);
    expect(result.findings.flatMap((f) => f.raw_occurrence_indexes).sort()).toEqual([0, 1, 2]);
  });
  it("fails closed instead of dropping an unclassified raw finding", () => {
    const result = ledger({ classified: classified.slice(0, 1) });
    expect(result.reconciled).toBe(false);
    expect(result.summary.unexplained).toBe(1);
    expect(result.findings).toHaveLength(2);
  });
  it("rejects mismatched catalog SHA and unknown ownership", () => {
    expect(ledger({ catalog: { ...catalog, candidateSha: "c".repeat(40) } }).reconciled).toBe(
      false,
    );
    const result = ledger({ domains: domains.slice(0, 1) });
    expect(result.reconciled).toBe(false);
    expect(result.summary.unexplained).toBe(1);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Effect = {
  id: string;
  section: string;
  classification: string;
  current_evidence_classification: string;
  evidence_refs: string[];
  dependency_owner: string;
  remediation_direction: string;
  history_action: string;
  production_change_authorized: boolean;
};
const report = JSON.parse(
  readFileSync(new URL("../../docs/v3/recovery-candidates/evidence/s01-hosted-source-delta-2026-11-09.json", import.meta.url), "utf8"),
) as { sourceMainSha: string; frontier: Record<string, unknown>; currentCatalogProbe: Record<string, unknown>; reviewedEffects: Effect[] };
const rows = report.reviewedEffects;
const scope = (s: string) => rows.filter(row => row.section === s);

describe("S01 source/hosted dated effect evidence", () => {
  it("pins the exact observed frontier and keeps history distinct from effects", () => {
    expect(report.sourceMainSha).toBe("1297490c9367cf7c002f68059d681a1a094f739a");
    expect(report.frontier).toMatchObject({
      sourceFileCount: 495, hostedHistoryRecords: 497,
      postCutoverHistoryHoles: 36, sourcePendingAfterHead: 33,
      postCutoverNameMismatches: 0, postCutoverHostedOnly: 0,
    });
    expect(scope("history-gap")).toHaveLength(36);
    expect(scope("source-pending")).toHaveLength(33);
    expect(scope("source-pending").every(row => row.classification === "unknown" &&
      row.current_evidence_classification === "unknown")).toBe(true);
    expect(rows.some(row => row.id === "20261108004000_v3_s14_signed_combined_projection.sql" &&
      row.classification === "unknown")).toBe(true);
  });

  it("keeps all 83 reviewed effects evidence-backed, owned, nonmutating, and unique", () => {
    expect(rows).toHaveLength(83);
    expect(new Set(rows.map(row => row.id)).size).toBe(83);
    for (const row of rows) {
      expect(["present", "partial", "absent", "unknown"]).toContain(row.classification);
      expect(["present", "partial", "absent", "unknown"]).toContain(row.current_evidence_classification);
      expect(row.evidence_refs.length).toBeGreaterThan(0);
      expect(row.dependency_owner.trim()).not.toBe("");
      expect(row.remediation_direction.trim()).not.toBe("");
      expect(row.history_action).toBe("preserve");
      expect(row.production_change_authorized).toBe(false);
    }
  });

  it("does not confuse the hosted write guards and grants with source-only effects or RLS access", () => {
    expect(scope("catalog-object").filter(row => row.classification === "present")).toHaveLength(2);
    expect(scope("catalog-object").filter(row => row.classification === "absent")).toHaveLength(8);
    expect(scope("table-acl")).toHaveLength(4);
    expect(scope("table-acl").every(row => row.classification === "present")).toBe(true);
    expect(report.currentCatalogProbe).toMatchObject({
      hostedOnlyGuardsPresent: 2, sourceOnlyNamedObjectsAbsent: 8,
      notificationDeliveriesRls: true,
      notificationDeliveriesDirectPrivilegeBitsPresent: 4,
    });
  });

  it("retains the dated 28 missing / 8 partial classification without claiming entire migration parity", () => {
    expect(scope("history-gap").filter(row => row.classification === "absent")).toHaveLength(28);
    expect(scope("history-gap").filter(row => row.classification === "partial")).toHaveLength(8);
    expect(scope("history-gap").some(row => row.current_evidence_classification === "unknown")).toBe(true);
  });
});

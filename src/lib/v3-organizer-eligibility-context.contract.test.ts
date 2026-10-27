import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/eligibility.tsx"),
  "utf8",
);

describe("V3 Organizer Eligibility exact-scope safety", () => {
  it("fails closed instead of selecting the newest edition", () => {
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).not.toContain("[...editions].sort");
    expect(route).toContain("Solaris will not substitute the newest edition");
    expect(route).toContain("enabled: Boolean(resolvedEditionId)");
  });

  it("rejects cross-edition override evidence and stale detail context", () => {
    expect(route).toContain("override.editionId !== resolvedEditionId");
    expect(route).toContain("row.editionId === resolvedEditionId && row.countryId === search.country");
    expect(route).toContain("key={`${resolvedEditionId || 'none'}:${selected?.countryId ?? 'none'}`}");
    expect(route).toContain("item.editionId === resolvedEditionId && item.countryId === selected?.countryId");
  });

  it("binds preview and apply to the exact edition, country and rule", () => {
    expect(route).toContain("assertEligibilityPreviewScope(preview, editionId, commandCountryId, input.rule.id)");
    expect(route).toContain("assertEligibilityPreviewScope(preview, editionId, country.countryId, input.override.affectedRule)");
    expect(route).toContain("pending.preview.editionId !== editionId");
    expect(route).toContain("pending.preview.countryId !== country.countryId");
    expect(route).toContain("pending.rule.id !== pending.preview.affectedRule");
    expect(route).toContain("expectedVersion: pending.preview.expectedVersion");
    expect(route).toContain("operationId: pending.operationId");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
  });

  it("rejects a receipt that does not reconcile to the previewed scope", () => {
    expect(route).toContain("receipt.editionId !== editionId");
    expect(route).toContain("receipt.countryId !== pending.preview.countryId");
    expect(route).toContain("receipt.affectedRule !== pending.preview.affectedRule");
    expect(route).toContain("receipt.operationId !== pending.operationId");
    expect(route).toContain("Eligibility receipt did not match the previewed Organizer scope.");
  });

  it("retains the accepted governed Eligibility cutover with explicit evidence", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "operations-eligibility",
    );
    expect(capability?.targetDomain).toBe("contest");
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    expect(capability?.migrationEvidence).toContain("studio2-eligibility-integration.test.ts");
  });
});

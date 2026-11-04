import { describe, expect, it } from "vitest";

import { solarisV6Domain } from "./solaris-v6-domain-registry";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";
import {
  v3ProjectionsInvalidatedByEvent,
} from "./v3-projection-reconciliation-registry";
import { v3SystemDomain } from "./v3-system-domain-registry";

describe("System V3 S14 archive registry ownership", () => {
  it("declares edition.archived under the single canonical Edition owner", () => {
    expect(solarisV6Domain("edition")?.events).toContain("edition.archived");
    expect(v3SystemDomain("edition")?.eventTypes).toContain("edition.archived");
  });

  it("marks the archive consequence as event-backed with executable evidence", () => {
    const consequence = v3DomainConsequence("edition.archived");

    expect(consequence?.ownerDomain).toBe("edition");
    expect(consequence?.implementationState).toBe("event-backed");
    expect(consequence?.auditRequired).toBe(true);
    expect(consequence?.evidence).toEqual(
      expect.arrayContaining([
        "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
        "src/lib/v3-s14-archive-consequences.contract.test.ts",
        ".github/scripts/v3-s14-archive-system-rehearsal.sh",
      ]),
    );
  });

  it("invalidates every canonical Edition projection when Archive becomes fact", () => {
    const edition = v3SystemDomain("edition");
    const invalidated = v3ProjectionsInvalidatedByEvent("edition.archived");
    const projections = new Set(invalidated.map((item) => item.projection));

    expect(edition).not.toBeNull();
    for (const projection of edition?.projections ?? []) {
      expect(projections.has(projection), projection).toBe(true);
    }
  });
});

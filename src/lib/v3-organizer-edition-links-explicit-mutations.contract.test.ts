import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/confirmations/admin/editions.tsx", "utf8");

describe("V3 Organizer Confirmation edition-link mutation boundaries", () => {
  it("keeps opening the edition-links page observational", () => {
    const mountStart = route.indexOf("useEffect(() => {");
    const mountEnd = route.indexOf("const remoteById = useMemo", mountStart);
    const mountEffect = route.slice(mountStart, mountEnd);

    expect(mountStart).toBeGreaterThanOrEqual(0);
    expect(mountEnd).toBeGreaterThan(mountStart);
    expect(mountEffect).toContain("await refresh();");
    expect(mountEffect).not.toContain("await synchronize(false)");
    expect(route).toContain("Opening this page is read-only");
  });

  it("requires an explicit review before the legacy binding synchronization runs", () => {
    expect(route).toContain("Review edition link sync");
    expect(route).toContain("onClick={() => setSyncReviewOpen(true)}");
    expect(route).toContain('title="Synchronize delegation edition links?"');
    expect(route).toContain('confirmLabel="Run legacy edition-link sync"');
    expect(route).toContain("await synchronize(true);");
    expect(route).toContain("remains tracked in System #702");
  });

  it("reviews edition-wide editing changes and rechecks live state before apply", () => {
    expect(route).toContain("reviewEditing(edition, remote)");
    expect(route).toContain("const latest = await refresh();");
    expect(route).toContain("liveRemote.editing_enabled !== pendingEditing.previous");
    expect(route).toContain("liveRemote.id !== pendingEditing.remoteId");
    expect(route).toContain("setConfirmationEditionEditing(pendingEditing.remoteId, pendingEditing.next)");
    expect(route).toContain("Type SSC ${pendingEditing.edition.edition_number} exactly");
  });

  it("reports the implemented edition-link surface as building without claiming canonical parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "delegation-edition-links",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
    expect(route).toContain("Canonical expected-version, receipt and idempotency semantics remain System-owned in #702");
  });
});

import { describe, expect, it } from "vitest";

import { buildPermissionCutoverReadiness } from "./permission-cutover-readiness";

describe("Permission Engine cutover readiness", () => {
  it("does not treat zero observations as a successful mismatch result", () => {
    const readiness = buildPermissionCutoverReadiness({
      windowDays: 30,
      evaluations: 0,
      matched: 0,
      mismatched: 0,
      legacyAllowedCapabilityDenied: 0,
      legacyDeniedCapabilityAllowed: 0,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.gates.find((gate) => gate.id === "evidence")?.state).toBe("waiting");
    expect(readiness.gates.find((gate) => gate.id === "mismatches")?.state).toBe("ready");
  });

  it("keeps pre-cutover mismatches as historical evidence instead of blocking current access", () => {
    const readiness = buildPermissionCutoverReadiness({
      windowDays: 30,
      evaluations: 8,
      matched: 7,
      mismatched: 1,
      legacyAllowedCapabilityDenied: 1,
      legacyDeniedCapabilityAllowed: 0,
    });

    expect(readiness.gates.find((gate) => gate.id === "evidence")?.state).toBe("ready");
    expect(readiness.gates.find((gate) => gate.id === "mismatches")?.state).toBe("ready");
    expect(readiness.gates.find((gate) => gate.id === "mismatches")?.detail).toContain(
      "historical evidence",
    );
    expect(readiness.ready).toBe(true);
  });
});

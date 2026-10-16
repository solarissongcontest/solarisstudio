import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/community-moderation.tsx",
  "utf8",
);

describe("V3 Organizer Community Moderation", () => {
  it("states the global public-identity scope instead of implying an edition mutation", () => {
    expect(source).toContain("Scope · global community identity");
    expect(source).toContain("Global public identity");
    expect(source).toContain(
      "Scope: public community identity across eligible surfaces, not an edition, show or competitive record.",
    );
  });

  it("uses the governed moderation command and stable operation identity", () => {
    expect(source).toContain('command: "community.fan_identity.moderate"');
    expect(source).toContain("operationId: command.operationId");
    expect(source).toContain("idempotencyKey: command.idempotencyKey");
    expect(source).toContain('"admin_set_fan_profile_moderation"');
    expect(source).toContain("p_operation_id: operationId");
    expect(source).toContain("p_idempotency_key: idempotencyKey");
    expect(source).toContain("allowSameIdentityRetry");
  });

  it("makes the non-competitive consequence explicit before confirmation", () => {
    expect(source).toContain(
      "Predictions, scores, percentiles and historical competitive data remain unchanged.",
    );
    expect(source).toContain("requiresImpactPreview(MODERATION_RISK)");
    expect(source).toContain("The Organizer decision is written to the canonical audit log.");
  });
});

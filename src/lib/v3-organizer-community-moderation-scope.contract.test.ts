import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/community-moderation.tsx",
  "utf8",
);
const registry = readFileSync("src/lib/v3-organizer-capability-registry.ts", "utf8");

describe("V3 Organizer Community Moderation scope", () => {
  it("labels Community identity as a global public-identity scope", () => {
    expect(route).toContain("Scope · global community identity");
    expect(route).toContain("Global public identity");
    expect(route).toContain(
      "Scope: public community identity across eligible surfaces, not an edition, show or competitive record.",
    );
    expect(route).not.toContain("useAdminContext");
  });

  it("keeps competitive truth explicitly outside moderation scope", () => {
    expect(route).toContain(
      "without altering predictions, scores or historical competitive data",
    );
    expect(route).toContain(
      "Predictions, scores, percentiles and historical competitive data remain unchanged.",
    );
  });

  it("preserves governed replay-safe moderation authority and reason evidence", () => {
    expect(route).toContain('rpc(\n        "admin_set_fan_profile_moderation"');
    expect(route).toContain("p_operation_id: operationId");
    expect(route).toContain("p_idempotency_key: idempotencyKey");
    expect(route).toContain("moderationReason.trim()");
    expect(route).toContain("The Organizer decision is written to the canonical audit log.");
  });

  it("records the capability as building without claiming parity", () => {
    expect(registry).toContain('id === "workspace-community-moderation"');
  });
});

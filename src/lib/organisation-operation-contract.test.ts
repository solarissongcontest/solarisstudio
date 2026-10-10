import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ORGANISATION_RISK_CLASSES,
  ORGANISATION_SCREEN_STATES,
  createOrganisationCommand,
  requiresImpactPreview,
  requiresLiveAcknowledgement,
} from "./organisation-operation-contract";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 operation contract", () => {
  it("defines the universal screen-state and risk vocabularies", () => {
    expect(ORGANISATION_SCREEN_STATES).toEqual([
      "loading",
      "ready",
      "empty",
      "partial",
      "stale",
      "offline",
      "error",
      "forbidden",
      "conflict",
      "expired",
      "submitting",
      "acknowledged",
      "read-only",
      "maintenance",
      "degraded",
    ]);
    expect(ORGANISATION_RISK_CLASSES).toEqual(["R0", "R1", "R2", "R3"]);
    expect(requiresImpactPreview("R2")).toBe(true);
    expect(requiresImpactPreview("R3")).toBe(true);
    expect(requiresImpactPreview("R1")).toBe(false);
    expect(requiresLiveAcknowledgement("R2")).toBe(true);
  });

  it("creates one stable command identity for retries", () => {
    const command = createOrganisationCommand({
      command: "test.command",
      riskClass: "R2",
      expectedVersion: 4,
      scope: { editionId: "ssc-21", entityId: "example" },
      payload: { value: 1 },
      operationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "stable-key",
    });

    expect(command.operationId).toBe("00000000-0000-4000-8000-000000000001");
    expect(command.idempotencyKey).toBe("stable-key");
    expect(command.expectedVersion).toBe(4);
    expect(command.riskClass).toBe("R2");
  });

  it("stores successful command receipts without storing request payloads", () => {
    const migration = source(
      "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
    );

    expect(migration).toContain("studio2_operation_receipts");
    expect(migration).toContain("unique (actor_id, command, idempotency_key)");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).toContain("Operation id is already used by another command");
    expect(migration).toContain("'replayed', true");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).not.toContain("payload jsonb");
  });

  it("uses R2 impact review for public fan identity moderation", () => {
    const route = source("src/routes/_authenticated/admin/community-moderation.tsx");
    expect(route).toContain('const MODERATION_RISK = "R2"');
    expect(route).toContain("requiresImpactPreview(MODERATION_RISK)");
    expect(route).toContain("Predictions, scores, percentiles and historical competitive data remain unchanged.");
    expect(route).toContain("p_operation_id");
    expect(route).toContain("p_idempotency_key");
  });

  it("uses the command envelope for failed push retry", () => {
    const route = source("src/routes/_authenticated/admin/system-operations.tsx");
    expect(route).toContain('command: "system.push.retry_failed"');
    expect(route).toContain('riskClass: "R1"');
    expect(route).toContain("p_operation_id");
    expect(route).toContain("p_idempotency_key");
  });
});

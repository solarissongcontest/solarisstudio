import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveSolarisV6OperationRecovery } from "@/lib/solaris-v6-operation-recovery";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 consequential command recovery", () => {
  it("retries a lost response only with the same stable operation identity", () => {
    const recovery = resolveSolarisV6OperationRecovery(
      new Error("Failed to fetch"),
      { stableOperationIdentity: true },
    );

    expect(recovery).toMatchObject({
      action: "retry-same-operation",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    });
    expect(recovery.description).toContain("same operation identity");
    expect(recovery.description).toContain("replayed");
  });

  it("does not retry stale-version conflicts", () => {
    expect(
      resolveSolarisV6OperationRecovery(
        { status: 409, message: "Expected version 4, found 5" },
        { stableOperationIdentity: true },
      ),
    ).toMatchObject({
      kind: "conflict",
      action: "refresh-canonical",
      allowSameIdentityRetry: false,
      shouldRefreshCanonical: true,
      keepOperationOpen: false,
    });
  });

  it("stops after auth or permission changes rather than replaying stale authority", () => {
    expect(
      resolveSolarisV6OperationRecovery(
        { status: 401, message: "JWT expired" },
        { stableOperationIdentity: true },
      ).action,
    ).toBe("reauthenticate");

    expect(
      resolveSolarisV6OperationRecovery(
        { status: 403, message: "permission denied" },
        { stableOperationIdentity: true },
      ),
    ).toMatchObject({
      action: "refresh-access",
      allowSameIdentityRetry: false,
      shouldRefreshCanonical: true,
    });
  });

  it("never invents a second command while offline", () => {
    const recovery = resolveSolarisV6OperationRecovery(
      new Error("network"),
      { online: false, stableOperationIdentity: true },
    );
    expect(recovery.action).toBe("wait-and-retry-same-operation");
    expect(recovery.allowSameIdentityRetry).toBe(true);
    expect(recovery.outcomeUnknown).toBe(true);
  });

  it("keeps R2 moderation on one stable operation identity across ambiguous retries", () => {
    const moderation = source(
      "src/routes/_authenticated/admin/community-moderation.tsx",
    );
    expect(moderation).toContain("operationId: command.operationId");
    expect(moderation).toContain("idempotencyKey: command.idempotencyKey");
    expect(moderation).toContain("operationId: pendingModeration.operationId");
    expect(moderation).toContain("idempotencyKey: pendingModeration.idempotencyKey");
    expect(moderation).toContain("resolveSolarisV6OperationRecovery");
    expect(moderation).toContain("Retry same operation");
    expect(moderation).toContain("shouldRefreshCanonical");
  });

  it("fails toward canonical refresh when no stable operation identity exists", () => {
    const recovery = resolveSolarisV6OperationRecovery(
      new Error("Failed to fetch"),
      { stableOperationIdentity: false },
    );
    expect(recovery.action).toBe("refresh-canonical");
    expect(recovery.allowSameIdentityRetry).toBe(false);
    expect(recovery.shouldRefreshCanonical).toBe(true);
  });
});

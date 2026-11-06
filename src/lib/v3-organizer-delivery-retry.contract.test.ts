import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/system-operations.tsx",
  "utf8",
);
const adapter = readFileSync("src/lib/v3-organizer-delivery-retry.ts", "utf8");

describe("Organizer Delivery & Jobs operation recovery", () => {
  it("reconciles unknown retry outcomes before another mutation", () => {
    expect(adapter).toContain('rpc("studio2_reconcile_operation"');
    expect(adapter).toContain('"operation_not_found"');
    expect(adapter).toContain("allowSameIdentityRetry: isMissingReceipt(error)");
    expect(route).toContain("reconcileDeliveryRetry");
    expect(route).toContain("Reconcile operation");
    expect(route).toContain("before another mutation is allowed");
  });

  it("binds a reconciled receipt to the exact command, operation and delivery", () => {
    expect(adapter).toContain('DELIVERY_RETRY_COMMAND = "system.push.retry_failed"');
    expect(adapter).toContain("receipt.operationId !== input.operationId");
    expect(adapter).toContain("receipt.command !== DELIVERY_RETRY_COMMAND");
    expect(adapter).toContain("row.deliveryId === input.deliveryId");
    expect(adapter).toContain("row.operationId === input.operationId");
  });

  it("blocks replay for processing, uncertain, unavailable or mismatched receipts", () => {
    expect(adapter).toContain('reason: "invalid_receipt"');
    expect(adapter).toContain('reason: "reconciliation_unavailable"');
    expect(adapter).toContain('"operation_uncertain"');
    expect(adapter).toContain('"operation_processing"');
    expect(route).toContain('outcome.reason === "invalid_receipt"');
    expect(route).toContain("Operation blocked");
  });

  it("requires explicit caller-owned RPC injection rather than importing Supabase in a V3 library", () => {
    expect(adapter).not.toContain("integrations/supabase");
    expect(adapter).not.toContain("defaultClient");
    expect(route).toContain("supabase as unknown as DeliveryRetryRpcClient");
  });

  it("does not introduce direct notification table writes or a second operation authority", () => {
    expect(route).not.toMatch(/\.from\(["']notification_deliveries["']\)\s*\.update/i);
    expect(adapter).not.toContain("notification_deliveries");
    expect(adapter).toContain('"admin_retry_failed_notification_delivery"');
    expect(adapter).toContain('"studio2_reconcile_operation"');
  });

  it("drops stale retry/reconciliation state on account change and isolates private telemetry", () => {
    expect(route).toContain('import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext"');
    expect(route).toContain("const actorId = useAuthenticatedUser().id;");
    expect(route).toContain("const currentActorRef = useRef(actorId);");
    expect(route).toContain('queryKey: ["admin-system-runtime-health", actorId]');
    expect(route).toContain("currentActorRef.current = actorId;");
    expect(route).toContain("retryIdentities.current.clear();");
    expect(route).toContain("setRetryRecovery(null);");
    expect(route).toContain("if (actorIdAtRequest !== currentActorRef.current) return;");
    expect(route).toContain("if (currentActorRef.current !== actorIdAtRequest)");
    expect(route).toContain("actorIdAtRequest: actorId");
    expect(route).toContain('queryKey: ["admin-system-runtime-health", actorIdAtRequest]');
  });

  it("keeps the original operation identity stable until the outcome settles", () => {
    expect(route).toContain("retryIdentities.current.get(deliveryId)");
    expect(route).toContain("retryIdentities.current.set(deliveryId, identity)");
    expect(route).toContain("retryIdentities.current.delete(deliveryId)");
    expect(route).toContain("operationId: identity.operationId");
  });
});

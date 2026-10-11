import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-televote-migration-adapter.ts"), "utf8");

describe("Solaris Studio V3 Televote migration adapter architecture", () => {
  it("stays pure and does not own transport, storage or production mutation", () => {
    const adapter = source();

    expect(adapter).not.toContain("@supabase");
    expect(adapter).not.toContain("createClient(");
    expect(adapter).not.toContain("fetch(");
    expect(adapter).not.toContain("localStorage");
    expect(adapter).not.toContain("sessionStorage");
    expect(adapter).not.toContain("useMutation(");
    expect(adapter).not.toContain("useServerFn(");
  });

  it("does not preserve the legacy already-recorded-equals-success shortcut", () => {
    const adapter = source();

    expect(adapter).toContain('kind: "already_recorded_needs_reconciliation"');
    expect(adapter).toContain('kind: "blocked_duplicate_guard"');
    expect(adapter).toContain('reason: "network_duplicate"');
    expect(adapter).toContain('reason: "device_duplicate"');
    expect(adapter).toContain("it does not prove this exact ballot was previously committed");
  });

  it("keeps transport ambiguity distinct from confirmed server rejection", () => {
    const adapter = source();

    expect(adapter).toContain('kind: "transport_ambiguous"');
    expect(adapter).toContain('kind: "server_rejection"');
    expect(adapter).toContain('kind: "uncertain", reason: "transport_error"');
    expect(adapter).toContain("confirmed server-function/PostgreSQL rejection");
  });

  it("forces integrity-state changes through explicit recheck outcomes", () => {
    const adapter = source();

    expect(adapter).toContain('kind: "recheck_required"');
    expect(adapter).toContain('reason: "integrity_check_missing"');
    expect(adapter).toContain('reason: "integrity_check_expired"');
    expect(adapter).toContain('reason: "ballot_changed"');
    expect(adapter).toContain('reason: "identity_changed"');
    expect(adapter).toContain('reason: "attestation_required"');
  });

  it("bridges current success as legacy evidence without inventing authoritative time or projection sync", () => {
    const adapter = source();

    expect(adapter).toContain("createV3LegacyServerSuccessEvidence");
    expect(adapter).toContain('workflow: "televote"');
    expect(adapter).toContain('projectionState: "pending"');
    expect(adapter).not.toContain('projectionState: "synced"');
    expect(adapter).not.toContain("Date.now(");
    expect(adapter).not.toContain("new Date(");
  });

  it("requires exact submission and operation identity for future authoritative receipts", () => {
    const adapter = source();

    expect(adapter).toContain("expectedIdentity");
    expect(adapter).toContain("matchV3ReceiptIdentity");
    expect(adapter).toContain("outcome.receipt.entityId !== submissionId");
    expect(adapter).toContain('reason: "missing_expected_identity"');
    expect(adapter).toContain('reason: "receipt_entity_mismatch"');
    expect(adapter).toContain('reason: "receipt_identity_mismatch"');
    expect(adapter).toContain('reason: "invalid_receipt"');
  });
});

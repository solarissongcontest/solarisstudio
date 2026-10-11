import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-authoritative-receipt.ts"), "utf8");

describe("Solaris Studio V3 authoritative receipt architecture", () => {
  it("keeps the receipt contract pure and storage agnostic", () => {
    const protocol = source();

    expect(protocol).not.toContain("@supabase");
    expect(protocol).not.toContain("createClient(");
    expect(protocol).not.toContain("fetch(");
    expect(protocol).not.toContain("localStorage");
    expect(protocol).not.toContain("sessionStorage");
    expect(protocol).not.toContain("useEffect(");
    expect(protocol).not.toContain("useQuery(");
  });

  it("requires hashes and operation identity on authoritative receipts", () => {
    const protocol = source();

    expect(protocol).toContain("idempotencyKey");
    expect(protocol).toContain("requestHash");
    expect(protocol).toContain("resultHash");
    expect(protocol).toContain("actorId");
    expect(protocol).toContain("action");
    expect(protocol).toContain("contextKey");
  });

  it("uses server acceptance time for audit-grade receipts", () => {
    const protocol = source();

    expect(protocol).toContain("serverAcceptedAt");
    expect(protocol).toContain('authority: "authoritative_server"');
    expect(protocol).toContain("Client\n * time, browser storage and optimistic UI state are not receipt authority");
    expect(protocol).not.toContain("Date.now(");
    expect(protocol).not.toContain("new Date(");
  });

  it("keeps legacy success explicitly below audit-grade authority", () => {
    const protocol = source();

    expect(protocol).toContain('authority: "legacy_server_success"');
    expect(protocol).toContain("clientObservedAt");
    expect(protocol).toContain("deliberately NOT promoted to an authoritative receipt");
    expect(protocol).toContain("needsReceiptReconciliation: true");
    expect(protocol).toContain("auditReady: false");
  });

  it("does not confuse projection lag with submission failure", () => {
    const protocol = source();

    expect(protocol).toContain('V3ReceiptProjectionState = "synced" | "pending"');
    expect(protocol).toContain("workflowCommitted: true");
    expect(protocol).toContain('projectionPending: evidence.projectionState === "pending"');
  });
});

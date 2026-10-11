import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-confirmation-migration-adapter.ts"), "utf8");

describe("Solaris Studio V3 Confirmation migration adapter architecture", () => {
  it("stays pure and does not own production transport or storage", () => {
    const adapter = source();

    expect(adapter).not.toContain("@supabase");
    expect(adapter).not.toContain("createClient(");
    expect(adapter).not.toContain("fetch(");
    expect(adapter).not.toContain("localStorage");
    expect(adapter).not.toContain("sessionStorage");
    expect(adapter).not.toContain("useServerFn(");
    expect(adapter).not.toContain("useEffect(");
  });

  it("keeps generic server and transport failures uncertain", () => {
    const adapter = source();

    expect(adapter).toContain('result.error === "server"');
    expect(adapter).toContain('kind: "uncertain", reason: "server_error"');
    expect(adapter).toContain('kind: "uncertain", reason: "transport_error"');
    expect(adapter).toContain("callers must not blindly retry with a fresh operation identity");
  });

  it("bridges current success as legacy evidence rather than inventing server receipt authority", () => {
    const adapter = source();

    expect(adapter).toContain("createV3LegacyServerSuccessEvidence");
    expect(adapter).toContain("clientObservedAt");
    expect(adapter).not.toContain("Date.now(");
    expect(adapter).not.toContain("new Date(");
  });

  it("requires exact expected identity and committed entity before accepting a future authoritative receipt", () => {
    const adapter = source();

    expect(adapter).toContain("expectedIdentity");
    expect(adapter).toContain("matchV3ReceiptIdentity");
    expect(adapter).toContain("result.receipt.entityId !== result.submission_id");
    expect(adapter).toContain('reason: "missing_expected_identity"');
    expect(adapter).toContain('reason: "receipt_identity_mismatch"');
    expect(adapter).toContain('reason: "receipt_entity_mismatch"');
    expect(adapter).toContain('reason: "invalid_receipt"');
  });

  it("does not confuse downstream projection lag with mutation failure", () => {
    const adapter = source();

    expect(adapter).toContain('return value === "synced" ? "synced" : "pending"');
    expect(adapter).toContain("The participant\n  // mutation may still be committed");
    expect(adapter).toContain('kind: "committed"');
  });
});

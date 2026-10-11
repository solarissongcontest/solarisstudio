import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-jury-migration-adapter.ts"), "utf8");

describe("Solaris Studio V3 Jury migration adapter architecture", () => {
  it("stays pure and does not own production transport or storage", () => {
    const adapter = source();

    expect(adapter).not.toContain("@supabase");
    expect(adapter).not.toContain("createClient(");
    expect(adapter).not.toContain("fetch(");
    expect(adapter).not.toContain("localStorage");
    expect(adapter).not.toContain("sessionStorage");
    expect(adapter).not.toContain("useMutation(");
    expect(adapter).not.toContain("useEffect(");
  });

  it("distinguishes transactional RPC rejection from transport ambiguity", () => {
    const adapter = source();

    expect(adapter).toContain('kind: "rpc_rejection"');
    expect(adapter).toContain('kind: "transport_ambiguous"');
    expect(adapter).toContain("A PostgreSQL RPC rejection is authoritative rollback evidence");
    expect(adapter).toContain("transport ambiguity must remain uncertain");
    expect(adapter).toContain('kind: "uncertain", reason: "transport_error"');
  });

  it("bridges the current ballot UUID as legacy committed evidence without inventing receipt authority", () => {
    const adapter = source();

    expect(adapter).toContain("createV3LegacyServerSuccessEvidence");
    expect(adapter).toContain('workflow: "jury"');
    expect(adapter).toContain('projectionState: "pending"');
    expect(adapter).toContain("clientObservedAt");
    expect(adapter).not.toContain("Date.now(");
    expect(adapter).not.toContain("new Date(");
  });

  it("requires exact operation and ballot identity before accepting a future authoritative receipt", () => {
    const adapter = source();

    expect(adapter).toContain("expectedIdentity");
    expect(adapter).toContain("matchV3ReceiptIdentity");
    expect(adapter).toContain("outcome.receipt.entityId !== ballotId");
    expect(adapter).toContain('reason: "missing_expected_identity"');
    expect(adapter).toContain('reason: "receipt_identity_mismatch"');
    expect(adapter).toContain('reason: "receipt_entity_mismatch"');
    expect(adapter).toContain('reason: "invalid_receipt"');
  });

  it("does not claim current Jury provides authoritative receipt or projection-sync evidence", () => {
    const adapter = source();

    expect(adapter).not.toContain('authority: "legacy_server_success"');
    expect(adapter).toContain('projectionState: "pending"');
    expect(adapter).not.toContain('projectionState: "synced"');
  });
});

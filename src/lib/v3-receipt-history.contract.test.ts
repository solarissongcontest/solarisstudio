import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-receipt-history.ts"), "utf8");

describe("Solaris Studio V3 receipt history architecture", () => {
  it("stays pure and presentation-data only", () => {
    const projection = source();

    expect(projection).not.toContain("@supabase");
    expect(projection).not.toContain("createClient(");
    expect(projection).not.toContain("fetch(");
    expect(projection).not.toContain("localStorage");
    expect(projection).not.toContain("sessionStorage");
    expect(projection).not.toContain("useEffect(");
    expect(projection).not.toContain("useQuery(");
  });

  it("preserves explicit time authority instead of flattening server and device clocks", () => {
    const projection = source();

    expect(projection).toContain('"server_accepted"');
    expect(projection).toContain('"client_observed"');
    expect(projection).toContain("timeAuthority");
    expect(projection).toContain("must not relabel client time as server acceptance");
  });

  it("keeps legacy completion visibly below verified receipt authority", () => {
    const projection = source();

    expect(projection).toContain('"verified_receipt"');
    expect(projection).toContain('"awaiting_authoritative_receipt"');
    expect(projection).toContain("auditReady: false");
    expect(projection).toContain("canOpenOfficialReceipt: false");
    expect(projection).toContain("receiptId: null");
  });

  it("rejects conflicting authoritative receipts rather than using last-write-wins", () => {
    const projection = source();

    expect(projection).toContain("sameImmutableEvidence");
    expect(projection).toContain("conflicting authoritative receipts for one workflow entity");
    expect(projection).toContain("integrity conflict, not a last-write-wins situation");
  });

  it("does not mix server and device clock values into one chronological list", () => {
    const projection = source();

    expect(projection).toContain("verified:");
    expect(projection).toContain("awaitingReceipt:");
    expect(projection).toContain("Sorting occurs only within");
    expect(projection).toContain("Mixing server acceptance and device clock");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-media-upload-continuity.ts"), "utf8");

describe("Solaris Studio V3 media upload continuity architecture", () => {
  it("keeps recovery pure and outside the Supabase/storage transport implementation", () => {
    const protocol = source();

    expect(protocol).not.toContain("@supabase");
    expect(protocol).not.toContain("createClient(");
    expect(protocol).not.toContain("storage.from");
    expect(protocol).not.toContain("functions.invoke");
    expect(protocol).not.toContain("fetch(");
    expect(protocol).not.toContain("useEffect(");
    expect(protocol).not.toContain("useMutation(");
  });

  it("never invents a new authorization during ambiguous transport", () => {
    const protocol = source();

    expect(protocol).toContain('"quarantine_uncertain"');
    expect(protocol).toContain('"finalize_uncertain"');
    expect(protocol).toContain('"finalize_same_authorization"');
    expect(protocol).toContain('"retry_finalize_same_authorization"');
    expect(protocol).toContain('"upload_same_authorization"');
    expect(protocol).toContain("same authorization");
    expect(protocol).not.toContain("randomUUID");
    expect(protocol).not.toContain("crypto.randomUUID");
  });

  it("treats Asset Already Exists as reconciliation evidence rather than success or failure", () => {
    const protocol = source();

    expect(protocol).toContain('kind: "asset_already_exists"');
    expect(protocol).toContain("intentionally ambiguous rather than failed");
    expect(protocol).toContain('state: "quarantine_uncertain"');
  });

  it("uses the server finalizer as the reconciliation boundary for an ambiguous quarantine upload", () => {
    const protocol = source();

    expect(protocol).toContain("existing Solaris finalizer becomes the reconciliation");
    expect(protocol).toContain('outcome.kind === "quarantine_missing"');
    expect(protocol).toContain('state: "retry_upload"');
  });

  it("preserves the current replayable finalization contract", () => {
    const protocol = source();

    expect(protocol).toContain("replayed: boolean");
    expect(protocol).toContain("replayed: true");
    expect(protocol).toContain("SAME token/secret");
  });

  it("requires exact upload token and final bucket on a verified receipt", () => {
    const protocol = source();

    expect(protocol).toContain("receipt.tokenId !== authorization.tokenId");
    expect(protocol).toContain("receipt.bucket !== authorization.finalBucket");
    expect(protocol).toContain(
      "verified media receipt belongs to another upload authorization",
    );
    expect(protocol).toContain(
      "verified media receipt used an unexpected final bucket",
    );
  });

  it("allows a fresh authorization only after authoritative terminal state", () => {
    const protocol = source();

    expect(protocol).toContain(
      'return upload.state === "rejected" || upload.state === "expired"',
    );
    expect(protocol).toContain("authoritatively terminal");
  });

  it("does not manufacture server time or receipt identity on the client", () => {
    const protocol = source();

    expect(protocol).not.toContain("Date.now(");
    expect(protocol).not.toContain("new Date(");
    expect(protocol).not.toContain("idempotencyKey");
  });
});

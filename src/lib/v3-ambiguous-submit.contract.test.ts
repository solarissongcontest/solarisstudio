import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris Studio V3 ambiguous submission architecture", () => {
  it("keeps reconciliation pure and transport/storage agnostic", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).not.toContain("@supabase");
    expect(protocol).not.toContain("createClient(");
    expect(protocol).not.toContain("fetch(");
    expect(protocol).not.toContain("localStorage");
    expect(protocol).not.toContain("sessionStorage");
    expect(protocol).not.toContain("setInterval(");
    expect(protocol).not.toContain("setTimeout(");
    expect(protocol).not.toContain("useMutation(");
    expect(protocol).not.toContain("useEffect(");
  });

  it("never equates transport ambiguity with application failure", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).toContain('kind: "ambiguous"');
    expect(protocol).toContain('state: "uncertain"');
    expect(protocol).toContain("Transport ambiguity is not an application failure");
  });

  it("requires retry to preserve the original idempotency identity", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).toContain("buildV3SameIdentityRetry");
    expect(protocol).toContain("return attempt.identity");
    expect(protocol).toContain("may not mint a new idempotency key");
  });

  it("treats not-found as retry-safe only when authoritative absence is explicit", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).toContain("absenceIsAuthoritative");
    expect(protocol).toContain(
      'evidence.status === "not_found" && evidence.absenceIsAuthoritative === true',
    );
  });

  it("bounds automatic reconciliation to protect infrastructure", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).toContain("V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS = 8");
    expect(protocol).toContain("V3_RECONCILIATION_MAX_DELAY_MS = 30_000");
    expect(protocol).toContain("automaticChecksExhausted");
    expect(protocol).toContain("uncontrolled");
    expect(protocol).toContain("Supabase egress leak");
  });

  it("binds authoritative reconciliation to key, request hash and operation scope", () => {
    const protocol = source("src/lib/v3-ambiguous-submit.ts");
    expect(protocol).toContain("idempotencyKey");
    expect(protocol).toContain("requestHash");
    expect(protocol).toContain("actorId");
    expect(protocol).toContain("action");
    expect(protocol).toContain("contextKey");
    expect(protocol).toContain('state: "identity_conflict"');
  });
});

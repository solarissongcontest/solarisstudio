import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-canonical-request-material.ts"), "utf8");

describe("Solaris Studio V3 canonical request-material architecture", () => {
  it("keeps canonicalization pure and independent from transport/storage", () => {
    const canonical = source();

    expect(canonical).not.toContain("@supabase");
    expect(canonical).not.toContain("createClient(");
    expect(canonical).not.toContain("fetch(");
    expect(canonical).not.toContain("localStorage");
    expect(canonical).not.toContain("sessionStorage");
    expect(canonical).not.toContain("useEffect(");
  });

  it("does not generate hashes, timestamps or randomness inside canonical request identity", () => {
    const canonical = source();

    expect(canonical).not.toContain("createHash(");
    expect(canonical).not.toContain("crypto.subtle");
    expect(canonical).not.toContain("Date.now(");
    expect(canonical).not.toContain("new Date(");
    expect(canonical).not.toContain("Math.random(");
    expect(canonical).toContain("Hashing is intentionally outside this module");
  });

  it("versions the bytes and declares the required hash/encoding contract", () => {
    const canonical = source();

    expect(canonical).toContain("V3_REQUEST_MATERIAL_VERSION = 1");
    expect(canonical).toContain('V3_REQUEST_HASH_ALGORITHM = "sha256"');
    expect(canonical).toContain('V3_REQUEST_MATERIAL_ENCODING = "utf-8"');
    expect(canonical).toContain("both MUST hash these exact");
  });

  it("sorts object keys while preserving array order and rejecting ambiguous JSON values", () => {
    const canonical = source();

    expect(canonical).toContain("[...enumerableKeys].sort()");
    expect(canonical).toContain("array order is retained");
    expect(canonical).toContain("does not support sparse arrays");
    expect(canonical).toContain("arrays cannot contain named properties");
    expect(canonical).toContain("does not support cyclic values");
    expect(canonical).toContain("supports only plain objects");
  });

  it("keeps operation scope inside canonical request material", () => {
    const canonical = source();

    expect(canonical).toContain("action: input.scope.action");
    expect(canonical).toContain("actorId: input.scope.actorId");
    expect(canonical).toContain("contextKey: input.scope.contextKey");
    expect(canonical).toContain("payload: input.payload");
  });

  it("documents why Unicode normalization is forbidden at the hash boundary", () => {
    const canonical = source();

    expect(canonical).toContain("does not normalize Unicode text");
    expect(canonical).toContain("NFC");
    expect(canonical).toContain("NFKC");
  });
});

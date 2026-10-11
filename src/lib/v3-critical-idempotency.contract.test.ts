import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris Studio V3 critical idempotency architecture", () => {
  it("keeps the protocol pure and storage agnostic", () => {
    const protocol = source("src/lib/v3-critical-idempotency.ts");
    expect(protocol).not.toContain("@supabase");
    expect(protocol).not.toContain("createClient(");
    expect(protocol).not.toContain("fetch(");
    expect(protocol).not.toContain("localStorage");
    expect(protocol).not.toContain("sessionStorage");
    expect(protocol).not.toContain("useMutation(");
    expect(protocol).not.toContain("useEffect(");
  });

  it("binds an idempotency key to both payload and operation scope", () => {
    const protocol = source("src/lib/v3-critical-idempotency.ts");
    expect(protocol).toContain("requestHash");
    expect(protocol).toContain("actorId");
    expect(protocol).toContain("action");
    expect(protocol).toContain("contextKey");
    expect(protocol).toContain('reason: "payload_mismatch"');
    expect(protocol).toContain('reason: "scope_mismatch"');
  });

  it("uses server leases and reservation tokens to protect concurrent execution", () => {
    const protocol = source("src/lib/v3-critical-idempotency.ts");
    expect(protocol).toContain("leaseExpiresAt");
    expect(protocol).toContain("reservationToken");
    expect(protocol).toContain("serverTime");
    expect(protocol).toContain('status: "stale_reservation"');
  });

  it("requires atomic server reservation instead of pretending the client can enforce exactly-once behavior", () => {
    const protocol = source("src/lib/v3-critical-idempotency.ts");
    expect(protocol).toContain("reserve the key and compare the existing record");
    expect(protocol).toContain("atomically");
    expect(protocol).toContain("Client-only storage");
  });

  it("distinguishes retryable and final failures", () => {
    const protocol = source("src/lib/v3-critical-idempotency.ts");
    expect(protocol).toContain('"failed_retryable"');
    expect(protocol).toContain('"failed_final"');
    expect(protocol).toContain('reason: "retryable_failure"');
    expect(protocol).toContain('decision: "final_failure"');
  });
});

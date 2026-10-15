import { describe, expect, it } from "vitest";

import {
  createSystemError,
  sanitizeSystemErrorMetadata,
  systemErrorCodeFromUnknown,
  toSystemError,
} from "@/lib/system-error";
import { SYSTEM_ERROR_CODES } from "@/lib/system-operation-contract";

describe("System V3 error taxonomy", () => {
  it("provides safe product copy for every canonical code", () => {
    for (const code of SYSTEM_ERROR_CODES) {
      const error = createSystemError(code);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(20);
      expect(error.message).not.toMatch(/postgres|constraint|sql|stack/i);
    }
  });

  it("recognizes canonical database errors without returning raw prose", () => {
    const error = toSystemError({
      code: "P0001",
      message: "IDEMPOTENCY_CONFLICT",
      details: "studio2_operation_receipts_request_fingerprint secret payload",
    });
    expect(error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain("studio2_operation_receipts");
    expect(JSON.stringify(error)).not.toContain("secret payload");
  });

  it("maps transport, auth, concurrency and validation failures", () => {
    expect(systemErrorCodeFromUnknown({ status: 401 })).toBe("AUTHENTICATION");
    expect(systemErrorCodeFromUnknown({ statusCode: "429" })).toBe("RATE_LIMIT");
    expect(systemErrorCodeFromUnknown({ code: "40001" })).toBe("STATE_CHANGED");
    expect(systemErrorCodeFromUnknown({ code: "23514" })).toBe("VALIDATION");
    expect(systemErrorCodeFromUnknown(new Error("Failed to fetch"))).toBe("DEPENDENCY_FAILURE");
    expect(systemErrorCodeFromUnknown(new Error("Request timeout"))).toBe("TIMEOUT");
  });

  it("does not call an unclassified raw error safe", () => {
    const error = toSystemError(new Error("relation private.secret_table does not exist"));
    expect(error).toEqual({
      code: "UNKNOWN",
      message: "Something went wrong. Check the operation status before trying again.",
      retryable: false,
    });
  });

  it("bounds metadata to scalar safe values", () => {
    const metadata = sanitizeSystemErrorMetadata({
      field: "x".repeat(300),
      attempt: 2,
      retry: true,
      empty: null,
      nested: { secret: true },
    });
    expect(metadata?.field).toBe("x".repeat(160));
    expect(metadata?.attempt).toBe(2);
    expect(metadata?.retry).toBe(true);
    expect(metadata?.empty).toBeNull();
    expect(metadata).not.toHaveProperty("nested");
  });
});

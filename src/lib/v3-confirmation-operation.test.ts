import { describe, expect, it } from "vitest";

import {
  createV3ConfirmationOperation,
  markV3ConfirmationDispatched,
  markV3ConfirmationUncertain,
  prepareV3ConfirmationOperation,
} from "./v3-confirmation-operation";

const base = () =>
  createV3ConfirmationOperation({
    roundId: "round-1",
    browserSessionId: "browser-1",
    idempotencyKey: "key-1",
    clientPayloadFingerprint: "payload-a",
    now: "2026-10-12T12:00:00.000Z",
  });

describe("V3 Confirmation operation identity", () => {
  it("reuses the same key after an ambiguous dispatch of the same payload", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(true);
    expect(result.operation.idempotencyKey).toBe("key-1");
  });

  it("mints a new identity if the payload changed after ambiguity", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-b",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.idempotencyKey).toBe("key-2");
  });

  it("never reuses an ambiguous identity across browser-session scope", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-2",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.browserSessionId).toBe("browser-2");
  });

  it("does not reuse an already-ready identity as a generic duplicate-submit cache", () => {
    const result = prepareV3ConfirmationOperation({
      existing: base(),
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.idempotencyKey).toBe("key-2");
  });
});

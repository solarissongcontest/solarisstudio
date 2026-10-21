import { describe, expect, it } from "vitest";

import {
  createV3SessionRevocationAttempt,
  parseV3AccountSessionsProjection,
} from "./v3-account-sessions";

const handleA = "a".repeat(64);
const handleB = "b".repeat(64);

describe("V3 account session projection", () => {
  it("keeps only privacy-safe server session fields and identifies the current session", () => {
    const projection = parseV3AccountSessionsProjection({
      sessions: [
        {
          sessionHandle: handleA,
          current: true,
          createdAt: "2026-10-17T00:00:00Z",
          lastActiveAt: "2026-10-17T00:05:00Z",
          expiresAt: null,
          client: { device: "Linux device", browser: "Chrome" },
          assurance: {
            aal: "aal1",
            freshAuth: {
              fresh: true,
              method: "password",
              authenticatedAt: "2026-10-17T00:04:00Z",
              ageSeconds: 60,
              maxAgeSeconds: 300,
            },
          },
          rawSessionId: "must-not-be-consumed",
          ip: "203.0.113.10",
          accessToken: "must-not-be-consumed",
        },
        {
          sessionHandle: handleB,
          current: false,
          createdAt: "2026-10-16T10:00:00Z",
          lastActiveAt: "2026-10-16T12:00:00Z",
          client: { device: "iPhone", browser: "Safari" },
          assurance: { aal: "aal1", freshAuth: null },
        },
      ],
      securityHistory: [
        { type: "session_revoked", sessionHandle: "c".repeat(64), occurredAt: "2026-10-16T08:00:00Z" },
      ],
      serverTime: "2026-10-17T00:06:00Z",
    });

    expect(projection.schemaReady).toBe(true);
    expect(projection.sessions).toHaveLength(2);
    expect(projection.sessions[0]).toEqual({
      sessionHandle: handleA,
      current: true,
      createdAt: "2026-10-17T00:00:00Z",
      lastActiveAt: "2026-10-17T00:05:00Z",
      expiresAt: null,
      deviceLabel: "Linux device",
      browserLabel: "Chrome",
      aal: "aal1",
      freshAuth: {
        fresh: true,
        method: "password",
        authenticatedAt: "2026-10-17T00:04:00Z",
        ageSeconds: 60,
        maxAgeSeconds: 300,
      },
    });
    expect(JSON.stringify(projection)).not.toContain("203.0.113.10");
    expect(JSON.stringify(projection)).not.toContain("must-not-be-consumed");
  });

  it("fails closed on malformed handles or ambiguous current-session truth", () => {
    expect(() =>
      parseV3AccountSessionsProjection({
        sessions: [
          { sessionHandle: handleA, current: true },
          { sessionHandle: handleB, current: true },
        ],
      }),
    ).toThrow("authoritative current session");

    expect(() =>
      parseV3AccountSessionsProjection({
        sessions: [{ sessionHandle: "raw-auth-session-id", current: true }],
      }),
    ).toThrow("authoritative current session");

    expect(() => parseV3AccountSessionsProjection({ sessions: [] })).toThrow(
      "authoritative current session",
    );
  });

  it("creates one stable revocation identity for the caller to preserve across retries", () => {
    const attempt = createV3SessionRevocationAttempt(handleB);
    expect(attempt.sessionHandle).toBe(handleB);
    expect(attempt.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(attempt.idempotencyKey).toBe(`account-session-revoke:${attempt.operationId}`);
  });
});

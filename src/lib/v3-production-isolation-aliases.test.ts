import { describe, expect, it } from "vitest";

import { assertV3ProductionIsolation } from "../../scripts/check-v3-production-isolation";

describe("V3 production isolation Supabase CLI aliases", () => {
  it("accepts Supabase CLI aliases only when they are explicitly loopback-scoped", () => {
    const result = assertV3ProductionIsolation({
      API_URL: "http://127.0.0.1:54321",
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      SERVICE_ROLE_KEY: "local-test-service-role",
      V3_SERVICE_ROLE_SCOPE: "local",
    });

    expect(result.loopbackOnly).toBe(true);
    expect(result.inspected).toEqual(
      expect.arrayContaining([
        "API_URL",
        "DB_URL",
        "SERVICE_ROLE_KEY",
        "V3_SERVICE_ROLE_SCOPE",
      ]),
    );
  });

  it("rejects a hosted Supabase API_URL even when it uses the CLI alias", () => {
    expect(() =>
      assertV3ProductionIsolation({
        API_URL: "https://example-project.supabase.co",
      }),
    ).toThrow(/API_URL points at non-local host example-project\.supabase\.co/);
  });

  it("rejects a hosted Supabase DB_URL even when another local URL is present", () => {
    expect(() =>
      assertV3ProductionIsolation({
        API_URL: "http://127.0.0.1:54321",
        DB_URL:
          "postgresql://postgres:secret@db.example-project.supabase.co:5432/postgres",
      }),
    ).toThrow(/DB_URL points at non-local host db\.example-project\.supabase\.co/);
  });

  it("treats the CLI SERVICE_ROLE_KEY alias as privileged Supabase authority", () => {
    expect(() =>
      assertV3ProductionIsolation({
        SERVICE_ROLE_KEY: "must-not-float-without-local-context",
        V3_SERVICE_ROLE_SCOPE: "local",
      }),
    ).toThrow(
      /service-role credential is configured without any verified loopback Supabase\/database URL/,
    );
  });

  it("requires explicit local scope for the CLI service-role alias", () => {
    expect(() =>
      assertV3ProductionIsolation({
        API_URL: "http://localhost:54321",
        SERVICE_ROLE_KEY: "local-test-service-role",
      }),
    ).toThrow(/without V3_SERVICE_ROLE_SCOPE=local/);
  });
});

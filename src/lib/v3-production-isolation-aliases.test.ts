import { describe, expect, it } from "vitest";

import { assertV3ProductionIsolation } from "../../scripts/check-v3-production-isolation";

describe("V3 production isolation Supabase CLI aliases", () => {
  it("fails closed in CI without any local Supabase URL, including Quality legacy clients", () => {
    expect(() => assertV3ProductionIsolation({ CI: "true" })).toThrow(/CI requires at least one explicit verified loopback/);
    expect(() => assertV3ProductionIsolation({ CI: "true", SUPABASE_URL: "https://any-project.supabase.co" })).toThrow(/non-local host/);
    expect(() => assertV3ProductionIsolation({
      CI: "true",
      GITHUB_WORKFLOW: "Quality",
      SUPABASE_URL: "http://127.0.0.1:54321",
    })).toThrow(/Quality CI is missing VITE_SUPABASE_URL/);
    expect(assertV3ProductionIsolation({
      CI: "true",
      GITHUB_WORKFLOW: "Quality",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_URL: "http://127.0.0.1:54321",
      E2E_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
      CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
    }).loopbackOnly).toBe(true);
  });

  it("refuses misleading protocol, credentials and HTTP query redirection", () => {
    for (const value of [
      "ftp://127.0.0.1:54321",
      "http://user:pass@127.0.0.1:54321",
      "http://127.0.0.1:54321/?redirect=https://any-project.supabase.co",
    ]) expect(() => assertV3ProductionIsolation({ SUPABASE_URL: value })).toThrow();
  });

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

  it("rejects a PostgreSQL host query override hiding behind a loopback authority", () => {
    expect(() =>
      assertV3ProductionIsolation({
        DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.example.supabase.co",
      }),
    ).toThrow(/DB_URL contains a host authority override/);
  });

  it("rejects hostaddr, service and encoded host overrides on a local URL", () => {
    for (const query of ["hostaddr=203.0.113.5", "service=hosted-production", "%68ost=external-host"]) {
      expect(() =>
        assertV3ProductionIsolation({
          DB_URL: `postgresql://postgres:postgres@localhost:54322/postgres?${query}`,
        }),
      ).toThrow(/DB_URL contains a .* authority override/);
    }
  });

  it("accepts harmless PostgreSQL query parameters on an explicit loopback target", () => {
    expect(
      assertV3ProductionIsolation({
        DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres?application_name=solaris_s14",
      }).loopbackOnly,
    ).toBe(true);
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

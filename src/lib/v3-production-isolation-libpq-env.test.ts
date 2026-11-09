import { describe, expect, it } from "vitest";

import { assertV3ProductionIsolation } from "../../scripts/check-v3-production-isolation";

const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("V3 local-only libpq connection authority", () => {
  it("accepts explicitly single-loopback PostgreSQL environment hosts", () => {
    const result = assertV3ProductionIsolation({
      DB_URL: LOCAL_DATABASE_URL,
      PGHOST: "localhost",
      PGHOSTADDR: "127.0.0.1",
    });

    expect(result.loopbackOnly).toBe(true);
    expect(result.inspected).toEqual(
      expect.arrayContaining(["DB_URL", "PGHOST", "PGHOSTADDR"]),
    );

    expect(
      assertV3ProductionIsolation({
        PGHOST: "::1",
        PGHOSTADDR: "::1",
      }).loopbackOnly,
    ).toBe(true);
  });

  it.each([
    ["PGHOST", "db.example.supabase.co"],
    ["PGHOST", "/tmp"],
    ["PGHOST", "localhost,db.example.supabase.co"],
    ["PGHOSTADDR", "203.0.113.18"],
    ["PGHOSTADDR", "127.0.0.1,203.0.113.18"],
    ["PGHOSTADDR", "localhost"],
  ])("rejects %s=%s even alongside a verified local database URL", (key, value) => {
    expect(() =>
      assertV3ProductionIsolation({
        DB_URL: LOCAL_DATABASE_URL,
        [key]: value,
      }),
    ).toThrow(new RegExp(`${key} is not an explicit single loopback PostgreSQL host`));
  });

  it.each(["PGSERVICE", "PGSERVICEFILE"])(
    "rejects %s because an opaque service definition can reroute libpq",
    (key) => {
      expect(() =>
        assertV3ProductionIsolation({
          DB_URL: LOCAL_DATABASE_URL,
          [key]: key === "PGSERVICE" ? "production" : "/tmp/pg_service.conf",
        }),
      ).toThrow(new RegExp(`${key} configures an opaque PostgreSQL service override`));
    },
  );

  it("does not treat empty libpq host or service values as configured", () => {
    const result = assertV3ProductionIsolation({
      DB_URL: LOCAL_DATABASE_URL,
      PGHOST: " ",
      PGHOSTADDR: "",
      PGSERVICE: "",
      PGSERVICEFILE: " ",
    });
    expect(result.inspected).toEqual(["DB_URL"]);
  });

  it("keeps privileged local-only scope requirements in force", () => {
    expect(() =>
      assertV3ProductionIsolation({
        DB_URL: LOCAL_DATABASE_URL,
        PGHOSTADDR: "127.0.0.1",
        SERVICE_ROLE_KEY: "local-fixture-credential",
      }),
    ).toThrow(/without V3_SERVICE_ROLE_SCOPE=local/);
  });
});

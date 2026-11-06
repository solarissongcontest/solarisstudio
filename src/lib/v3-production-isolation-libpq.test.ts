import { describe, expect, it } from "vitest";

import { assertV3ProductionIsolation } from "../../scripts/check-v3-production-isolation";

const local = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("V3 local-only verification: ambient libpq connection routing", () => {
  it("accepts explicit loopback PostgreSQL hosts and an ordinary database name", () => {
    const result = assertV3ProductionIsolation({
      ...local,
      PGHOST: "localhost",
      PGHOSTADDR: "127.0.0.1",
      PGDATABASE: "postgres",
    });
    expect(result.loopbackOnly).toBe(true);
    expect(result.inspected).toEqual(expect.arrayContaining(["PGHOST", "PGHOSTADDR", "PGDATABASE"]));
  });

  it("accepts IPv6 loopback without treating it as remote", () => {
    expect(assertV3ProductionIsolation({ ...local, PGHOSTADDR: "::1" }).loopbackOnly).toBe(true);
  });

  it("rejects remote PGHOST even when API and database URLs are local", () => {
    expect(() => assertV3ProductionIsolation({ ...local, PGHOST: "db.production.example" }))
      .toThrow(/PGHOST is not an explicit loopback PostgreSQL host/);
  });

  it("rejects remote PGHOSTADDR even when PGHOST is localhost", () => {
    expect(() => assertV3ProductionIsolation({
      ...local,
      PGHOST: "localhost",
      PGHOSTADDR: "203.0.113.40",
    })).toThrow(/PGHOSTADDR is not an explicit loopback PostgreSQL host/);
  });

  it("rejects comma-separated fallback hosts and Unix-socket indirection", () => {
    for (const PGHOST of ["localhost,db.production.example", "/tmp/.s.PGSQL.5432"]) {
      expect(() => assertV3ProductionIsolation({ ...local, PGHOST }))
        .toThrow(/PGHOST is not an explicit loopback PostgreSQL host/);
    }
  });

  it("rejects service indirection independently of a loopback DB_URL", () => {
    for (const key of ["PGSERVICE", "PGSERVICEFILE"] as const) {
      expect(() => assertV3ProductionIsolation({ ...local, [key]: "production" }))
        .toThrow(new RegExp(`${key} configures indirect PostgreSQL service routing`));
    }
  });

  it("rejects connection-string PGDATABASE values", () => {
    for (const PGDATABASE of [
      "postgresql://postgres@db.production.example/postgres",
      "dbname=postgres host=db.production.example",
    ]) {
      expect(() => assertV3ProductionIsolation({ ...local, PGDATABASE }))
        .toThrow(/PGDATABASE is a connection string rather than a database name/);
    }
  });

  it("fails closed when only an unsafe ambient host is configured", () => {
    expect(() => assertV3ProductionIsolation({ PGHOSTADDR: "db.production.example" }))
      .toThrow(/PGHOSTADDR is not an explicit loopback PostgreSQL host/);
  });
});

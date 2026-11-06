#!/usr/bin/env node
// Zero-network, zero-database regression for the central V3 test-isolation guard.
// Run: node --experimental-strip-types --test scripts/check-v3-production-isolation-libpq.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { assertV3ProductionIsolation } from "./check-v3-production-isolation.ts";

const local = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

test("explicit local libpq environment is accepted", () => {
  const proof = assertV3ProductionIsolation({
    ...local,
    PGHOST: "localhost",
    PGHOSTADDR: "::1",
    PGDATABASE: "postgres",
  });
  assert.equal(proof.loopbackOnly, true);
  for (const name of ["PGHOST", "PGHOSTADDR", "PGDATABASE"]) {
    assert.ok(proof.inspected.includes(name), name + " must appear in guard evidence");
  }
});

for (const [name, environment, diagnostic] of [
  ["remote PGHOST despite loopback URLs", { ...local, PGHOST: "db.production.example" }, /PGHOST is not an explicit loopback/],
  ["remote hostaddr overrides localhost", { ...local, PGHOST: "localhost", PGHOSTADDR: "203.0.113.6" }, /PGHOSTADDR is not an explicit loopback/],
  ["multiple fallback hosts", { ...local, PGHOST: "localhost,db.production.example" }, /PGHOST is not an explicit loopback/],
  ["service profile", { ...local, PGSERVICE: "production" }, /PGSERVICE configures indirect PostgreSQL/],
  ["custom service file", { ...local, PGSERVICEFILE: "/tmp/prod.pg_service.conf" }, /PGSERVICEFILE configures indirect PostgreSQL/],
  ["database URL through PGDATABASE", { ...local, PGDATABASE: "postgresql://postgres@db.production.example/prod" }, /PGDATABASE is a connection string/],
  ["libpq keyword conninfo through PGDATABASE", { ...local, PGDATABASE: "dbname=postgres host=db.production.example" }, /PGDATABASE is a connection string/],
  ["remote ambient host with no explicit URL", { PGHOST: "db.production.example" }, /PGHOST is not an explicit loopback/],
]) {
  test("rejects " + name + " before any database traffic", () => {
    assert.throws(() => assertV3ProductionIsolation(environment), diagnostic);
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_VIEW_CATALOG_SQL, validateLocalDatabaseUrl, auditWorldViewRows,
  runLocalAudit, isolatedPgEnvironment,
} from "./audit-v3-world-view-boundaries.mjs";

const catalog = (views = []) => ({ roles: { anon: true, authenticated: true }, views });
const view = (overrides = {}) => ({
  schema: "public", name: "world_private_archive", kind: "v",
  securityInvoker: false, anonSelect: false, authenticatedSelect: false, ...overrides,
});
const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("accepts explicit loopback Supabase DB URLs", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.equal(validateLocalDatabaseUrl(`postgresql://postgres:postgres@${host}:54322/postgres`),
      `postgresql://postgres:postgres@${host}:54322/postgres`);
  }
});

test("rejects remote, authority confusion, libpq overrides and ambiguous targets", () => {
  for (const unsafe of [
    "https://127.0.0.1:54322/postgres",
    "postgresql://user:pass@evil.example:54322/postgres",
    "postgresql://user:pass@localhost:54322@evil.example:54322/postgres",
    "postgresql://user:pass@127.0.0.1:54322@evil.example:54322/postgres",
    "postgresql://localhost/postgres",
    "postgresql://localhost:54322/production",
    "postgresql://localhost:54322/postgres?host=evil.example",
    "postgresql://localhost:54322/postgres?hostaddr=8.8.8.8",
    "postgresql://localhost:54322/postgres?service=prod",
    "postgresql://localhost:54322/postgres#unsafe",
    "postgresql://localhost.evil.example:54322/postgres",
    "postgresql://[::ffff:7f00:1]:54322/postgres",
    "", undefined,
  ]) assert.throws(() => validateLocalDatabaseUrl(unsafe));
});

test("detects owner-privileged views readable by either browser role", () => {
  const result = auditWorldViewRows(catalog([
    view({ anonSelect: true }),
    view({ name: "world_office_history", authenticatedSelect: true }),
  ]));
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.map(x => x.code), [
    "WORLD_OWNER_VIEW_BROWSER_READ", "WORLD_OWNER_VIEW_BROWSER_READ",
  ]);
});

test("detects browser-readable materialized views even if labeled invoker", () => {
  const result = auditWorldViewRows(catalog([view({
    kind: "m", securityInvoker: true, anonSelect: true, authenticatedSelect: true,
  })]));
  assert.deepEqual(result.findings[0].readableBy, ["anon", "authenticated"]);
  assert.equal(result.findings[0].code, "WORLD_MATERIALIZED_VIEW_BROWSER_READ");
});

test("allows private views and browser-visible security-invoker views", () => {
  assert.deepEqual(auditWorldViewRows(catalog([
    view(), view({ name: "world_public_offices", securityInvoker: true, anonSelect: true }),
  ])), { checkedViews: 2, findings: [], passed: true });
});

test("fails closed on absent roles, malformed entries and duplicate rows", () => {
  assert.throws(() => auditWorldViewRows({ roles: { anon: false, authenticated: true }, views: [] }));
  assert.throws(() => auditWorldViewRows({ roles: { anon: true, authenticated: true }, views: {} }));
  assert.throws(() => auditWorldViewRows(catalog([view({ securityInvoker: null })])));
  assert.throws(() => auditWorldViewRows(catalog([view(), view()])));
});

test("local catalog runner keeps libpq environment overrides out and runs read-only SQL", () => {
  let captured;
  const report = runLocalAudit(url, {
    env: { PATH: "/usr/bin", PGHOST: "evil.example", PGSERVICE: "prod", PGOPTIONS: "-c something=bad" },
    runner: (command, args, options) => {
      captured = { command, args, options };
      return JSON.stringify(catalog([view()]));
    },
  });
  assert.equal(report.passed, true);
  assert.equal(captured.command, "psql");
  assert.equal(captured.args.includes("--no-password"), true);
  assert.equal(captured.args.includes("--dbname"), true);
  assert.equal(captured.args.includes(WORLD_VIEW_CATALOG_SQL), true);
  assert.equal(captured.options.env.PGHOST, undefined);
  assert.equal(captured.options.env.PGSERVICE, undefined);
  assert.equal(captured.options.env.PGOPTIONS, undefined);
  assert.equal(isolatedPgEnvironment({ PGHOSTADDR: "1.2.3.4", PATH: "/bin" }).PGHOSTADDR, undefined);
  assert.match(WORLD_VIEW_CATALOG_SQL, /has_table_privilege/);
  assert.match(WORLD_VIEW_CATALOG_SQL, /relkind in \('v', 'm'\)/);
});

test("rejects non-JSON catalog output and never calls runner for remote URL", () => {
  assert.throws(() => runLocalAudit(url, { runner: () => "not json" }));
  assert.throws(() => runLocalAudit("postgresql://evil.example:54322/postgres", {
    runner: () => { throw new Error("Remote runner must never start"); },
  }), /loopback/);
});

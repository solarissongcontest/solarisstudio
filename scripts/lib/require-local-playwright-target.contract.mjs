import assert from "node:assert/strict";
import test from "node:test";

import { requireLocalPlaywrightTarget } from "./require-local-playwright-target.mjs";

const local = "http://127.0.0.1:4177";

test("standalone browser target requires local origin", () => {
  assert.equal(requireLocalPlaywrightTarget(undefined, local), local);
  assert.equal(requireLocalPlaywrightTarget("http://localhost:4178", local), "http://localhost:4178");
  assert.equal(requireLocalPlaywrightTarget("http://[::1]:4177", local), "http://[::1]:4177");
});

test("hosted/ambiguous URL never launches Playwright", () => {
  for (const value of [
    "https://solaris.example", "https://project.supabase.co", "http://localhost.evil.test:4177",
    "http://127.0.0.1.evil.test:4177", "https://localhost@solaris.example",
    "http://192.168.1.7:4177", "http://0.0.0.0:4177", "file:///tmp/index.html",
    "javascript:alert(1)", "", " http://127.0.0.1:4177", "localhost:4177",
    "http://user:pass@127.0.0.1:4177", "http://localhost:4177/preview",
    "http://localhost:4177/?next=https://solaris.example", "http://localhost:4177/#external",
  ]) assert.throws(() => requireLocalPlaywrightTarget(value, local), /Playwright safety/, value);
});

test("standalone browser suites fail closed without local Supabase isolation", async () => {
  const { requireLocalPlaywrightSupabaseEnvironment: check } = await import("./require-local-playwright-target.mjs");
  const local = {
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_URL: "http://127.0.0.1:54321",
    E2E_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
    CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
  };
  assert.equal(check(local), true);
  for (const name of Object.keys(local)) {
    const missing = { ...local };
    delete missing[name];
    assert.throws(() => check(missing), /Playwright safety/, name);
  }
  for (const name of ["SUPABASE_URL", "API_URL", "DB_URL", "SUPABASE_DB_URL", "CONFIRMATIONS_SUPABASE_URL"]) {
    assert.throws(() => check({ ...local, [name]: "https://project.supabase.co" }), /Playwright safety/, name);
  }
  assert.throws(() => check({ ...local, DB_URL: "postgresql://postgres:password@localhost:54322/postgres?hostaddr=203.0.113.5" }), /authority override/);
  assert.equal(check({ ...local, DB_URL: "postgresql://postgres:password@localhost:54322/postgres?application_name=s14" }), true);
});

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

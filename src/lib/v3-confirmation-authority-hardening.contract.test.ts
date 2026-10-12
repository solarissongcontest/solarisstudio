import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261012011000_v3_confirmation_authority_hardening.sql",
  ),
  "utf8",
);

describe("V3 Confirmation direct-RPC hardening", () => {
  it("derives the receipt request hash inside Postgres", () => {
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("convert_to((payload - 'client_ip')::text, 'UTF8')");
    expect(migration).toContain("v_request_hash := encode(");
    expect(migration).toContain("v_existing.request_hash <> v_request_hash");
    expect(migration).toContain("v_request_hash,");
  });

  it("does not trust the compatibility request-hash parameter", () => {
    expect(migration).toContain("perform _request_hash");
    expect(migration).not.toContain("v_existing.request_hash <> _request_hash");
    expect(migration).not.toContain("request_hash,\n    _request_hash,");
  });

  it("binds the ledger scope to the browser session inside the protected payload", () => {
    expect(migration).toContain("payload ->> 'browser_session_id'");
    expect(migration).toContain("v_payload_session <> _browser_session_id");
    expect(migration).toContain("browser-session scope does not match payload");
  });

  it("keeps changing network metadata outside the logical request identity", () => {
    expect(migration).toContain("payload - 'client_ip'");
  });
});

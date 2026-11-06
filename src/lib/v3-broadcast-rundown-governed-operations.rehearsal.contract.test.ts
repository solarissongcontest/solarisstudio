import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(
    process.cwd(),
    ".github/scripts/v3-broadcast-rundown-governed-operations-rehearsal.sh",
  ),
  "utf8",
);

describe("V3 Broadcast Rundown governed-operation rehearsal", () => {
  it("fails closed unless both API and database are loopback-local", () => {
    expect(script).toContain('case "$API_URL" in http://127.0.0.1:*|http://localhost:*');
    expect(script).toContain("Refusing hosted Supabase rehearsal");
    expect(script).toContain('case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*');
    expect(script).toContain("Refusing non-local database rehearsal");
    expect(script).not.toContain("supabase.co");
  });

  it("uses a real local Auth session rather than bypassing session validation", () => {
    expect(script).toContain("/auth/v1/admin/users");
    expect(script).toContain("/auth/v1/token?grant_type=password");
    expect(script).toContain("access_token");
    expect(script).toContain("studio2_broadcast_rundown_v3");
  });

  it("rehearses exact scope, semantic replay, stale CAS and reconcile", () => {
    expect(script).toContain("cross-edition rundown read");
    expect(script).toContain("exact rundown save replay");
    expect(script).toContain("changed semantic replay");
    expect(script).toContain("stale rundown save");
    expect(script).toContain("studio2_reconcile_operation");
    expect(script).toContain("result.receiptId");
  });

  it("proves broadcast.manage and broadcast.control remain distinct authorities", () => {
    const manageGrant = script.indexOf("'broadcast.manage','$EDITION_ID'");
    const deniedControl = script.indexOf("segment transition without broadcast.control");
    const controlGrant = script.indexOf("'broadcast.control','$EDITION_ID'");
    const successfulControl = script.indexOf("segment ready transition");

    expect(manageGrant).toBeGreaterThan(-1);
    expect(deniedControl).toBeGreaterThan(manageGrant);
    expect(controlGrant).toBeGreaterThan(deniedControl);
    expect(successfulControl).toBeGreaterThan(controlGrant);
  });

  it("proves state-changing operations emit facts while desired-state no-op does not", () => {
    expect(script).toContain("show.changed");
    expect(script).toContain("No-op lock fabricated a DomainEvent");
    expect(script).toContain("does not contain exactly four show.changed facts");
    expect(script).toContain("broadcast.segment_started");
  });

  it("protects the stored version-2 compatibility contract", () => {
    expect(script).toContain("rundown.version");
    expect(script).toContain("version-2 compatibility contract");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const client = readFileSync(resolve(process.cwd(), "src/lib/show-lifecycle-authority.ts"), "utf8");
const commands = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019211000_v3_show_lifecycle_commands.sql"),
  "utf8",
);

describe("V3 Show lifecycle typed client", () => {
  it("targets the single canonical #1235 command family", () => {
    expect(client).toContain('"studio2_show_lifecycle_preview"');
    expect(client).toContain('rpcName: "studio2_create_show_v3"');
    expect(client).toContain('rpcName: "studio2_update_show_v3"');
    expect(client).toContain('rpcName: "studio2_update_show_mode_v3"');
    expect(client).toContain('rpcName: "studio2_delete_show_v3"');
    expect(client).not.toContain("studio2_apply_show_lifecycle_change");
    expect(client).not.toContain("expectedRevision");
  });

  it("uses the exact server-reviewed Show version for every existing-show mutation", () => {
    expect(client).toContain("expectedVersion: number");
    expect(client).toContain("p_expected_version: input.expectedVersion");
    expect(commands).toContain("VERSION_CONFLICT");
    expect(commands).toContain("for update");
  });

  it("preserves one stable operation identity and reconciles lost responses before retry", () => {
    expect(client).toContain("createShowLifecycleIdentity");
    expect(client).toContain("idempotencyKey: `${prefix}:${operationId}`");
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain("reconcileShowLifecycleOperation(input)");
    expect(client).toContain("Reconciliation is recovery");
  });

  it("does not perform direct Show lifecycle writes from the adapter", () => {
    expect(client).not.toContain('.from("shows")');
    expect(client).not.toContain(".insert(");
    expect(client).not.toContain(".update(");
    expect(client).not.toContain(".delete(");
  });

  it("keeps R3 fresh authentication explicit for permanent deletion", () => {
    expect(client).toContain("reauthenticateShowLifecycleR3");
    expect(client).toContain("supabase.auth.signInWithPassword");
    expect(commands).toContain("private.studio2_require_fresh_auth(300)");
  });

  it("parses the canonical dependency-aware destructive preview", () => {
    expect(client).toContain("blockingTableCount");
    expect(client).toContain("blockingReferenceCount");
    expect(client).toContain("requiresFreshAuthentication");
    expect(client).toContain("hasPublicInformation");
    expect(commands).toContain("studio2_show_dependency_snapshot");
  });
});

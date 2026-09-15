import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_private_helper_cutover.sql"),
);

if (!migrationName) {
  throw new Error("Permission Engine private helper cutover migration is missing");
}

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

function functionBlock(name: string) {
  const start = migration.indexOf(`function private.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("Permission Engine private helper cutover", () => {
  it("uses one user-scoped predicate that becomes capability-only after cutover", () => {
    const block = functionBlock("studio2_user_access_allowed");
    expect(block).toContain("private.studio2_user_has_capability");
    expect(block).toContain("private.studio2_permission_engine_authoritative()");
    expect(block).toContain("public.has_role");
    expect(block).toContain("return v_capability_allowed;");
    expect(block).toContain("return v_legacy_allowed and v_capability_allowed;");
    expect(block).toContain("return v_legacy_allowed or v_capability_allowed;");
  });

  it("keeps the shared predicate private from browser-facing roles", () => {
    expect(migration).toContain(
      "revoke all on function private.studio2_user_access_allowed(uuid, text, uuid, boolean)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("removes direct legacy-role checks from existing Studio 2 domain helpers", () => {
    for (const helper of [
      "studio2_can_manage_broadcast",
      "studio2_can_manage_eligibility",
      "studio2_can_manage_host",
      "studio2_can_manage_media_assets",
      "studio2_can_manage_permissions",
      "studio2_can_manage_storytelling",
      "studio2_can_preview_results",
      "studio2_can_read_host",
      "studio2_can_read_storytelling",
      "studio2_can_verify_results",
      "studio2_feature_enabled_for",
      "studio2_require_communications_access",
    ]) {
      const block = functionBlock(helper);
      expect(block).toContain("studio2_user_access_allowed");
      expect(block).not.toContain("public.has_role");
    }
  });

  it("preserves pre-cutover OR semantics for existing specialist helpers", () => {
    for (const helper of [
      "studio2_can_manage_broadcast",
      "studio2_can_manage_eligibility",
      "studio2_can_manage_host",
      "studio2_can_manage_media_assets",
      "studio2_can_manage_permissions",
      "studio2_can_manage_storytelling",
      "studio2_can_preview_results",
      "studio2_can_read_host",
      "studio2_can_read_storytelling",
      "studio2_can_verify_results",
    ]) {
      expect(functionBlock(helper)).toContain("false");
    }
  });

  it("preserves each existing helper's exact domain capability mapping", () => {
    const expectedCapabilities: Record<string, string[]> = {
      studio2_can_manage_broadcast: ["edition.manage"],
      studio2_can_manage_eligibility: ["entry.approve"],
      studio2_can_manage_host: ["host.manage", "edition.manage"],
      studio2_can_manage_media_assets: ["entry.approve"],
      studio2_can_manage_permissions: ["permissions.manage"],
      studio2_can_manage_storytelling: ["story.manage", "edition.manage"],
      studio2_can_preview_results: [
        "results.preview",
        "results.verify",
        "results.publish",
      ],
      studio2_can_read_host: ["host.read", "host.manage", "edition.manage"],
      studio2_can_read_storytelling: [
        "story.read",
        "story.manage",
        "edition.manage",
      ],
      studio2_can_verify_results: ["results.verify"],
    };

    for (const [helper, capabilities] of Object.entries(expectedCapabilities)) {
      const block = functionBlock(helper);
      for (const capability of capabilities) {
        expect(block).toContain(`'${capability}'`);
      }
    }
  });

  it("keeps rollout and communications on their existing capabilities", () => {
    const rollout = functionBlock("studio2_feature_enabled_for");
    expect(rollout).toContain("'rollout.read'");
    expect(rollout).toContain("false");

    const communications = functionBlock("studio2_require_communications_access");
    expect(communications).toContain("'communications.send'");
    expect(communications).toContain("false");
    expect(communications).toContain("v_is_service");
  });
});

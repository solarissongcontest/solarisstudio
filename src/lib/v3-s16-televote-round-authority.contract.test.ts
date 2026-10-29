import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20261027190500_v3_s16_televote_round_authority.sql");
const server = read("src/integrations/televoting/rounds.server.ts");
const functions = read("src/integrations/televoting/rounds.functions.ts");
const view = read("src/components/televoting/VotingRoundsView.tsx");

describe("S16 Televote round mutation authority", () => {
  test("routes round CRUD through explicit governed commands", () => {
    for (const command of ["v3_create_round", "v3_rename_round", "v3_delete_draft_round"]) {
      expect(migration).toContain(`televoting.${command}`);
      expect(server).toContain(`"${command}"`);
    }

    expect(server).not.toContain('.from("rounds").insert');
    expect(server).not.toContain('.from("rounds").update');
    expect(server).not.toContain('.from("rounds").delete');
    expect(server).not.toContain('.from("rounds").upsert');
    expect(server).not.toContain('.from("televoting_round_bindings").insert');
    expect(server).not.toContain('.from("televoting_round_bindings").update');
    expect(server).not.toContain('.from("televoting_round_bindings").delete');
    expect(server).not.toContain('.from("televoting_round_bindings").upsert');
  });

  test("uses canonical capability, scoped operation identity and round CAS", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("p_expected_round_version");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("studio2_televote_round_versions");
    expect(migration).toContain("private.studio2_complete_operation");

    expect(functions).toContain("expectedRoundVersion");
    expect(view).toContain("expectedRoundVersion: editing.version");
    expect(view).toContain("expectedRoundVersion: target.version");
  });

  test("keeps the Organizer rounds projection read-only and versioned", () => {
    const getStart = server.indexOf("export async function getMergedTelevotingRoundsServer");
    const createStart = server.indexOf("export async function createMergedTelevotingRoundServer");
    const getBody = server.slice(getStart, createStart);

    expect(getBody).not.toContain("ensureCanonicalTelevotingEditionsServer");
    expect(getBody).not.toContain("syncMergedRoundFromSolarisServer");
    expect(getBody).not.toContain("autoSyncDraftTelevotingRoundsForEditionServer");
    expect(getBody).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(migration).toContain("'version', version");
  });

  test("does not grant mutation commands to anonymous or service role callers", () => {
    expect(migration).toContain(
      "revoke all on function televoting.v3_create_round(uuid, text, uuid, text, uuid)\n  from public, anon, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function televoting.v3_rename_round(uuid, text, bigint, uuid, text, uuid)\n  from public, anon, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function televoting.v3_delete_draft_round(uuid, bigint, uuid, text, uuid)\n  from public, anon, service_role;",
    );
  });
});

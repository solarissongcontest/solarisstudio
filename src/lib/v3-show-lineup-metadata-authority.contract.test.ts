import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261026193000_v3_show_lineup_metadata_authority.sql",
  "utf8",
);
const server = readFileSync("src/lib/admin-lineup-metadata.functions.ts", "utf8");

describe("V3 governed show entry metadata authority", () => {
  it("registers the strict post-S13 forward-fix contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.show-lineup-metadata-authority");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/drop\s+(table|column|function)/i);
  });

  it("versions both the active show and reusable edition metadata sources", () => {
    expect(migration).toContain("private.v3_show_metadata_state_payload");
    expect(migration).toContain("private.v3_show_metadata_state_version");
    expect(migration).toContain("'show', private.v3_show_lineup_state_payload(p_show_id)");
    expect(migration).toContain("'editionSources'");
    expect(migration).toContain("extensions.digest");
  });

  it("fails closed for published participant metadata", () => {
    expect(migration).toContain("published_entry_metadata");
    expect(migration).toContain("message = 'PUBLISHED_ENTRY_METADATA'");
    expect(migration).toContain("v_participant.publication_status = 'published'");
  });

  it("locks edition metadata sources before rechecking CAS", () => {
    const claimIndex = migration.indexOf("private.studio2_claim_operation(");
    const sourceLockIndex = migration.indexOf(
      "where p.edition_id = p_edition_id\n  order by p.id\n  for update;",
    );
    const versionIndex = migration.indexOf("message = 'VERSION_CONFLICT'");
    expect(claimIndex).toBeGreaterThan(-1);
    expect(sourceLockIndex).toBeGreaterThan(claimIndex);
    expect(versionIndex).toBeGreaterThan(sourceLockIndex);
  });

  it("syncs only blank active-show metadata from a matching same-edition identity", () => {
    expect(migration).toContain("target.show_id = p_show_id");
    expect(migration).toContain("target.artist is null");
    expect(migration).toContain("target.song is null");
    expect(migration).toContain("source.show_id is distinct from p_show_id");
    expect(migration).toContain("source.contest_entity_id = v_target.contest_entity_id");
    expect(migration).toContain("source.country_id = v_target.country_id");
  });

  it("writes audit, show.changed event and an S2 receipt", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("exposes a replay-safe authenticated metadata server boundary", () => {
    expect(server).toContain("export const executeShowLineupMetadataOperation");
    expect(server).toContain("runShowLineupMetadataOperation");
    expect(server).toContain('client.rpc("v3_show_lineup_metadata_preflight"');
    expect(server).toContain('client.rpc("v3_execute_show_lineup_metadata_operation"');
    const runnerIndex = server.indexOf("runShowLineupMetadataOperation");
    const reconcileIndex = server.indexOf(
      "reconcileExistingOperation(client, operationId)",
      runnerIndex,
    );
    const preflightIndex = server.indexOf(
      'client.rpc("v3_show_lineup_metadata_preflight"',
      runnerIndex,
    );
    expect(reconcileIndex).toBeGreaterThan(runnerIndex);
    expect(preflightIndex).toBeGreaterThan(reconcileIndex);
    expect(server).toContain("data.operationId ?? crypto.randomUUID()");
    expect(server).toContain(
      "data.idempotencyKey ?? `show-lineup-metadata:${data.action}:${operationId}`",
    );
  });
});

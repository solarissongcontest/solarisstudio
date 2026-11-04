import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261104230000_v3_country_flag_crop_command_authority.sql",
  ),
  "utf8",
);

const flagRoleRunner = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-country-flag-crop-authorization-rehearsal.sh"), "utf8",
);
const flagRoleWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-country-flag-crop-authorization-rehearsal.yml"), "utf8",
);

describe("System V3 country flag display-crop authority", () => {
  it("tests exact country authorization, private hash grants and isolated rehearsal", () => {
    expect(flagRoleWorkflow).toContain("supabase db reset --local --no-seed");
    expect(flagRoleWorkflow).toContain("supabase stop --no-backup");
    expect(flagRoleWorkflow).not.toContain("secrets.");
    expect(flagRoleRunner).toContain("ANONYMOUS_FLAG_CROP_RPC_EXPOSED");
    expect(flagRoleRunner).toContain("PRIVATE_FLAG_CROP_HASH_EXPOSED");
    expect(flagRoleRunner).toContain("UNAUTHORIZED_FLAG_CROP_PREVIEW_SUCCEEDED");
    expect(flagRoleRunner).toContain("UNAUTHORIZED_FLAG_CROP_MUTATION_SUCCEEDED");
    expect(flagRoleRunner).toContain("rollback;");
  });

  it.each([
    ["http://localhost:54321", "postgresql://postgres:postgres@hosted.invalid:54322/postgres"],
    ["http://localhost:54321", "postgresql://postgres:postgres@localhost:54322@hosted.invalid/postgres"],
    ["http://localhost:54321", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=hosted.invalid"],
    ["http://localhost:54321@hosted.invalid", "postgresql://postgres:postgres@localhost:54322/postgres"],
  ])("denies hosted flag crop fixture URL before psql: %s %s", (apiUrl, databaseUrl) => {
    const root = mkdtempSync(join(tmpdir(), "solaris-flag-crop-auth-"));
    try {
      writeFileSync(join(root, "supabase"),
        `#!/bin/sh\nprintf '%s\\n' 'API_URL=${apiUrl}' 'DB_URL=${databaseUrl}'\n`,
        { mode: 0o755 });
      writeFileSync(join(root, "psql"), "#!/bin/sh\\necho MOCK_PSQL_STARTED >&2\\nexit 9\\n".replaceAll("\\n", "\n"), { mode: 0o755 });
      const result = spawnSync(
        "bash", [resolve(".github/scripts/v3-country-flag-crop-authorization-rehearsal.sh")],
        { encoding: "utf8", env: { ...process.env, PATH: `${root}:${process.env.PATH}` } },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing");
      expect(result.stderr).not.toContain("MOCK_PSQL_STARTED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });


  it("uses canonical semantic S13 identity and an architecture-safe transport bridge", () => {
    expect(migration).toContain("'v3.country.flag-crop-authority'");
    expect(migration).not.toContain("'20261023204600_v3_country_flag_crop_command_authority'");
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/v3-country-flag-crop-client.ts"), "utf8",
    );
    const transport = readFileSync(
      resolve(process.cwd(), "src/lib/studio2-country-flag-crop-transport.ts"), "utf8",
    );
    expect(source).toContain('from "./studio2-country-flag-crop-transport"');
    expect(source).not.toContain('from "@/integrations/supabase/client"');
    expect(transport).toContain('from "@/integrations/supabase/client"');
  });


  it("registers the additive migration through the canonical S13 contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.country.flag-crop-authority'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("exposes a capability-gated authoritative preflight with an opaque source+crop CAS version", () => {
    expect(migration).toContain("public.studio2_country_flag_crop_preflight");
    expect(migration).toContain(
      "private.studio2_user_has_capability(v_actor, 'delegation.manage', null)",
    );
    expect(migration).toContain("private.v3_country_flag_crop_state_version(");
    expect(migration).toContain("'flagImage', v_country.flag_image");
    expect(migration).toContain("'stateVersion', v_state_version");
    expect(migration).toContain("'FLAG_SOURCE_MISSING'");
    expect(migration).not.toContain("grant execute on function public.studio2_country_flag_crop_preflight(uuid)\n  to anon");
  });

  it("governs the mutation through S2 idempotency and actor-scoped receipt reconciliation", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'country.update_identity'");
    expect(migration).toContain("'flag_display_crop'");
    expect(migration).toContain("'R1'");
    expect(migration).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
    expect(migration).toContain("public.studio2_reconcile_operation(p_operation_id)");
    expect(migration).toContain("jsonb_build_object('replayed', true)");
    expect(migration).toContain("jsonb_build_object('replayed', false)");
  });

  it("locks one exact country and rejects a stale reviewed source/crop before writing", () => {
    const lockIndex = migration.indexOf("where country.id = p_country_id\n  for update;");
    const versionIndex = migration.indexOf(
      "v_live_version := private.v3_country_flag_crop_state_version(",
    );
    const conflictIndex = migration.indexOf("message = 'VERSION_CONFLICT'");
    const updateIndex = migration.indexOf("update public.countries\n  set");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(versionIndex).toBeGreaterThan(lockIndex);
    expect(conflictIndex).toBeGreaterThan(versionIndex);
    expect(updateIndex).toBeGreaterThan(conflictIndex);
  });

  it("validates the canonical crop bounds server-side and never writes the source flag image", () => {
    expect(migration).toContain("p_flag_crop_x < 0 or p_flag_crop_x > 100");
    expect(migration).toContain("p_flag_crop_y < 0 or p_flag_crop_y > 100");
    expect(migration).toContain("p_flag_crop_zoom < 1 or p_flag_crop_zoom > 2");

    const updateBlock = migration.slice(
      migration.indexOf("update public.countries\n  set"),
      migration.indexOf("returning * into v_country;") + "returning * into v_country;".length,
    );
    expect(updateBlock).toContain("flag_crop_x = p_flag_crop_x");
    expect(updateBlock).toContain("flag_crop_y = p_flag_crop_y");
    expect(updateBlock).toContain("flag_crop_zoom = p_flag_crop_zoom");
    expect(updateBlock).not.toContain("flag_image =");
  });

  it("records before/after audit evidence and emits the already-declared country identity fact", () => {
    const countryDomain = V3_SYSTEM_DOMAIN_REGISTRY.find(
      (domain) => domain.domain === "country-identity",
    );

    expect(countryDomain?.mutationCommands).toContain("country.update_identity");
    expect(countryDomain?.eventTypes).toContain("country.identity_changed");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'country_flag_crop_update'");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'country.identity_changed'");
    expect(migration).toContain("'before', v_before");
    expect(migration).toContain("'after', v_after");
  });

  it("returns explicit projection invalidation targets without inventing a browser-owned truth", () => {
    expect(migration).toContain("'invalidates', jsonb_build_array(");
    expect(migration).toContain("'country identity projection'");
    expect(migration).toContain("'country/Wiki/results identity'");
    expect(migration).toContain("'MySolaris country'");
    expect(migration).toContain("'Organizer Country'");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016061500_v3_s7_country_entry_object_authorization.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s7-entry-object-authorization-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-s7-entry-object-authorization-rehearsal.yml",
);

function functionBlock(name: string) {
  const marker = `create or replace function public.${name}`;
  const start = migration.toLowerCase().indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.toLowerCase().indexOf("create or replace function public.", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S7 country-entry object authorization", () => {
  it("resolves participant ownership before checking edition-scoped capability", () => {
    expect(migration).toContain("private.studio2_resolve_country_entry_edition");
    expect(migration).toContain("participant.id = p_participant_id");
    expect(migration).toContain("participant.country_id = p_country_id");
    expect(migration).toContain("entity.country_id = p_country_id");
    expect(migration).toContain("p_claimed_edition_id is distinct from v_target_edition_id");
    expect(migration).toContain("Entry is outside the requested edition scope");
  });

  it("binds both legacy mutation RPCs to the authoritative target edition", () => {
    for (const name of [
      "admin_upsert_country_entry",
      "admin_update_country_entry_listen_links",
    ]) {
      const fn = functionBlock(name);
      expect(fn).toContain("v_target_edition_id := private.studio2_resolve_country_entry_edition");
      expect(fn).toContain("studio2_access_allowed('entry.edit', v_target_edition_id, true)");
      expect(fn).not.toContain("studio2_access_allowed('entry.edit', _edition_id, true)");
    }
  });

  it("passes the same authorized edition into the internal writers", () => {
    expect(functionBlock("admin_upsert_country_entry")).toContain(
      "_participant_id,\n    v_target_edition_id,",
    );
    expect(functionBlock("admin_update_country_entry_listen_links")).toContain(
      "_participant_id,\n    v_target_edition_id,",
    );
  });

  it("keeps the object resolver inaccessible to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.studio2_resolve_country_entry_edition(uuid, uuid, uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("rehearses malicious ids and verifies denied requests leave Edition B unchanged", () => {
    expect(rehearsal).toContain("authorize Edition A but target Edition B participant");
    expect(rehearsal).toContain("cross-edition entry upsert");
    expect(rehearsal).toContain("cross-edition listen-link update");
    expect(rehearsal).toContain("missing capability preserves Edition B entry");
    expect(rehearsal).toContain("participant cannot be rebound through a different country id");
    expect(rehearsal).toContain("Matching object scope plus matching capability succeeds");
  });

  it("hard-fails the rehearsal if Supabase is not isolated/local", () => {
    expect(rehearsal).toContain('http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).not.toContain("supabase.co");
  });

  it("tests both clean replay and upgrade from current main", () => {
    expect(workflow).toContain("clean-replay:");
    expect(workflow).toContain("upgrade-from-main:");
    expect(workflow).toContain("git worktree add /tmp/solaris-s7-entry-auth-main origin/main");
    expect(workflow).toContain("supabase migration up --local --include-all");
  });
});

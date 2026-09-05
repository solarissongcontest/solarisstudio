import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("custom edition-only jury voting contract", () => {
  it("accepts contest entities as a complete jury voter identity", () => {
    const migration = source(
      "supabase/migrations/20260824122500_fix_custom_edition_jury_vote_identity.sql",
    );

    expect(migration).toContain("or voter_entity_id is not null");
    expect(migration).toContain("coalesce(voter_id, voter_entity_id, voter_country_id)");
    expect(migration).toContain("coalesce(receiving_entity_id, receiving_country_id)");
  });

  it("keeps organizer jury entry entity-aware for both voter and recipient", () => {
    const route = source("src/routes/_authenticated/admin/jury/$slug.tsx");

    expect(route).toContain("p_voter_entity_id: voterIdentity.contest_entity_id");
    expect(route).toContain("p_receiving_entity_id: target.contest_entity_id");
  });

  it("keeps edition-only countries separate from global country identity", () => {
    const entities = source("src/lib/entities.ts");

    expect(entities).toContain('entity_type: "custom"');
    expect(entities).toContain("country_id: null");
    expect(entities).toContain("entity.country_id ?? entity.id");
  });
});

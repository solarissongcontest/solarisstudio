import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261103165700_v3_tg4_world_document_identity_scope.sql",
  ),
  "utf8",
);

describe("Terra Solaris Governance TG4 document identity/member scope", () => {
  it("keeps organization membership country-based while authorizing current controllers", () => {
    expect(migration).toContain("public.world_organization_memberships membership_row");
    expect(migration).toContain("public.country_accounts account_row");
    expect(migration).toContain("account_row.country_id = membership_row.country_id");
    expect(migration).toContain("account_row.status = 'active'");
  });

  it("allows the country's active institutional representative to read member-visible law", () => {
    expect(migration).toContain("public.world_organization_representations representation_row");
    expect(migration).toContain("representation_row.organization_id = membership_row.organization_id");
    expect(migration).toContain("representation_row.country_id = membership_row.country_id");
    expect(migration).toContain("representation_row.user_id = auth.uid()");
    expect(migration).toContain("representation_row.ends_at is null");
  });

  it("resolves durable authorship from office, representative, then TG1 controller identity", () => {
    const office = migration.indexOf("public.world_office_terms term_row");
    const representative = migration.indexOf("public.world_organization_representations representation_row", office);
    const controller = migration.indexOf("public.world_country_control_terms control_row", representative);
    expect(office).toBeGreaterThan(-1);
    expect(representative).toBeGreaterThan(office);
    expect(controller).toBeGreaterThan(representative);
    expect(migration).toContain("term_row.holder_person_id");
    expect(migration).toContain("representation_row.person_id");
    expect(migration).toContain("control_row.person_id");
  });

  it("does not create a replacement membership, person or country-owner table", () => {
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/insert into public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/update public\.country_accounts/i);
  });

  it("registers the identity-scope migration at creation time", () => {
    expect(migration).toContain("'v3.tg4.world-document-identity-scope'");
    expect(migration).toContain("public.v3_register_migration_contract");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";

const read = (name: string) => readFileSync(resolve(process.cwd(), name), "utf8");
const sql = () => read("supabase/migrations/20261104173000_v3_tg3_public_representative_roster.sql");
const component = () => read("src/components/world/WorldRepresentativeRoster.tsx");
const route = () => read("src/routes/world/organizations/$slug_.representatives.tsx");
const transport = () => read("src/lib/world-representative-roster-data.ts");

describe("TG3 institutional public representative boundary", () => {
  it("registers the independent leaf route with existing Public capability authority", () => {
    const capability = V3_PUBLIC_CAPABILITIES.find((item) => item.id === "terra-world-representatives");
    expect(capability).toBeDefined();
    expect(capability?.legacyRoutes).toContain("/world/organizations/:slug/representatives");
    expect(capability?.specificationStatus).toBe("building");
    expect(route()).toContain('createFileRoute("/world/organizations/$slug/representatives")');
    expect(route()).toContain("<AppShell>");
    expect(route()).toContain("<AppScreen>");
  });

  it("uses TG2 representation and durable identities, never a second authority", () => {
    const source = sql();
    expect(source).toContain("public.world_organization_representations");
    expect(source).toContain("public.delegation_people");
    expect(source).toContain("public.world_organizations");
    expect(source).toContain("public.countries");
    expect(source).not.toMatch(/create\s+table\b/i);
    expect(source).not.toMatch(/insert\s+into\s+public\.world_organization_representations/i);
  });

  it("fails closed on nonpublic institutions and uses an explicit safe publication predicate", () => {
    expect(sql()).toContain("organization_row.public_visibility = 'public'");
    expect(sql()).toContain("if v_organization_id is null then");
    expect(sql()).toContain("return null;");
    expect(sql()).toContain("security definer");
    expect(sql()).toContain("set search_path = pg_catalog");
  });

  it("allows only narrow public fields, excludes private person linkage and proxy state", () => {
    const source = sql();
    for (const required of [
      "'displayName'", "'countryId'", "'countryCode'", "'votingAuthority'",
      "'startsAt'", "'endsAt'", "'revision'",
    ]) expect(source).toContain(required);
    expect(source).not.toMatch(/'personId'\s*,|'userId'\s*,|'proxyUserId'\s*,/);
    expect(source).toContain("revoke all on function public.world_public_representative_roster_v1");
    expect(source).toContain("grant execute on function public.world_public_representative_roster_v1");
  });

  it("enforces server bounds, literal searches, stable ordering and exact count", () => {
    const source = sql();
    expect(source).toContain("p_offset > 1600");
    expect(source).toContain("p_limit > 20");
    expect(source).toContain("char_length(v_search) > 64");
    expect(source).toContain("position(v_search in lower(person_row.display_name))");
    expect(source).toContain("row_number() over");
    expect(source).toContain("(select count(*) from scoped)");
    expect(source).toContain("'hasMore', v_total > p_offset + p_limit");
    expect(source).not.toContain("execute format(");
  });

  it("does not perform browser-owned writes and provides recovery states", () => {
    expect(transport()).toContain('.rpc("world_public_representative_roster_v1"');
    expect(transport()).not.toMatch(/\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(component()).toContain("query.isError");
    expect(component()).toContain("query.refetch()");
    expect(component()).toContain("No representatives in this view");
    expect(component()).toContain('aria-pressed={filter === option.value}');
    expect(component()).toContain('aspect-[3/2]');
    expect(component()).not.toContain("setInterval");
  });

  it("records additive migration provenance through existing S13 contract", () => {
    expect(sql()).toContain("v3_register_migration_contract");
    expect(sql()).toContain("'forward_fix_only'");
    expect(sql()).toContain("notify pgrst, 'reload schema'");
  });
});

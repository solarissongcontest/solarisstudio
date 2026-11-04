import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const listing = () => read("src/routes/world/organizations/index.tsx");
const detail = () => read("src/routes/world/organizations/$slug.tsx");
const screen = () => read("src/components/v3/V3WorldOrganizationsScreen.tsx");
const api = () => read("src/integrations/terra-world-public.ts");
const tg2 = () => read("supabase/migrations/20261102171600_v3_tg2_world_institution_access.sql");

describe("TG2 Public V3 integrations", () => {
  it("owns both new routes in the canonical capability registry", () => {
    const capability = V3_PUBLIC_CAPABILITIES.find((row) => row.id === "terra-world-organizations");
    expect(capability).toBeDefined();
    expect(capability?.targetArea).toBe("explore");
    expect(capability?.targetRoute).toBe("/world/organizations");
    expect(capability?.legacyRoutes).toContain("/world/organizations/*");
    expect(capability?.specificationStatus).toBe("building");
  });

  it("reuses upstream server publication authority and public RLS", () => {
    expect(api()).toContain('.rpc("world_organization_projection_v1", { p_slug: slug })');
    expect(api()).toContain('.eq("public_visibility", "public")');
    expect(tg2()).toContain("organization_row.public_visibility = 'public'");
    expect(tg2()).toContain("grant execute on function public.world_organization_projection_v1(text)");
    expect(api()).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  });
  it("wires real responsive routes without changing the shell or top-level nav", () => {
    expect(listing()).toContain('createFileRoute("/world/organizations/")');
    expect(detail()).toContain('createFileRoute("/world/organizations/$slug")');
    expect(listing()).toContain("<AppShell>");
    expect(detail()).toContain("<AppShell>");
    expect(listing()).toContain("<AppScreen>");
    expect(detail()).toContain("<AppScreen>");
  });
  it("has query budgets, empty states, and explicit retries", () => {
    expect(api()).toContain(".range(offset, offset + WORLD_ORGANIZATIONS_PAGE_SIZE)");
    expect(api()).toContain(".limit(20)");
    expect(screen()).toContain("No confirmed members");
    expect(screen()).toContain("retry: false");
    expect(screen()).toContain("query.refetch()");
    expect(api()).not.toContain("setInterval");
  });
});

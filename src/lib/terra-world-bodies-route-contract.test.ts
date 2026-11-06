import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A dynamic organization profile already owns /world/organizations/$slug.
 * Its component intentionally has no <Outlet />. Descendant public body
 * routes therefore need the non-nested $slug_ convention, or they disappear.
 */
const organizationRoutes = resolve(process.cwd(), "src/routes/world/organizations");
const bodyRoutes = resolve(organizationRoutes, "$slug_", "bodies");
const obsoleteNestedRoutes = resolve(organizationRoutes, "$slug", "bodies");

describe("TG3 published body route ownership", () => {
  it("uses non-nested TanStack routes instead of the organization profile layout", () => {
    expect(existsSync(resolve(bodyRoutes, "index.tsx"))).toBe(true);
    expect(existsSync(resolve(bodyRoutes, "$bodySlug.tsx"))).toBe(true);
    expect(existsSync(resolve(obsoleteNestedRoutes, "index.tsx"))).toBe(false);
    expect(existsSync(resolve(obsoleteNestedRoutes, "$bodySlug.tsx"))).toBe(false);
  });

  it("gates both public body pages using the canonical world rollout gate", () => {
    const directory = readFileSync(resolve(bodyRoutes, "index.tsx"), "utf8");
    const detail = readFileSync(resolve(bodyRoutes, "$bodySlug.tsx"), "utf8");
    expect(directory).toContain("WorldPublicGate");
    expect(detail).toContain("WorldPublicGate");
    expect(directory).toContain("WorldBodiesDirectory");
    expect(detail).toContain("WorldBodyDetails");
  });

  it("keeps public body directory discovery available with zero preview records", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/world/WorldPublic.tsx"), "utf8",
    );
    const section = source.split('aria-labelledby="world-organs-title"')[1]?.split("</section>")[0];
    expect(section).toBeDefined();
    expect(section).toContain('to="/world/organizations/$slug/bodies/"');
    expect(section).toContain("No public bodies have been recorded.");
    expect(section).not.toContain("projection.data.organs.length > 0 ? (");
  });

  it("keeps stable URL paths for both canonical public body screens", () => {
    const directory = readFileSync(resolve(bodyRoutes, "index.tsx"), "utf8");
    const detail = readFileSync(resolve(bodyRoutes, "$bodySlug.tsx"), "utf8");
    expect(directory).toContain('createFileRoute("/world/organizations/$slug/bodies/")');
    expect(detail).toContain('createFileRoute("/world/organizations/$slug/bodies/$bodySlug")');
  });
});

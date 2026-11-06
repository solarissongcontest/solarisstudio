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
    expect(section).toContain('to="/world/organizations/$slug/bodies"');
    expect(section).toContain("No public bodies have been recorded.");
    expect(section).not.toContain("projection.data.organs.length > 0 ? (");
  });

  it("uses AppShell's one main landmark rather than nesting another main element", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(shell).toContain("<main");
    expect(bodies).toContain("<AppShell><div");
    expect(bodies).toContain("</div></AppShell>");
    expect(bodies).not.toContain("<AppShell><main");
  });

  it("keeps AppShell mounted while app/platform detection resolves", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain("<AppShell><div");
    expect(bodies).toContain("platformResolved ? children");
    expect(bodies).toContain('aria-label="Opening Terra Solaris"');
    expect(bodies).not.toContain('if (!platformResolved) return');
  });

  it("uses the existing connectivity state for offline and restricted read errors", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain('connectivity.status === "offline"');
    expect(bodies).toContain('connectivity.status === "service-restricted"');
    expect(bodies).toContain("disabled={retryBlocked}");
    expect(bodies).toContain("disabled={officeNetworkBlocked}");
    expect(bodies).toContain("Unverified cached records are not displayed.");
    expect(bodies).not.toContain("window.addEventListener");
    expect(bodies).not.toContain("setInterval(");
  });

  it("never displays cached public body or office records while publication verification is blocked", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain("enabled: valid && !publicationBlocked");
    expect(bodies).toContain("enabled: valid && !officeNetworkBlocked");
    expect(bodies).toContain("enabled: !!result && !officeNetworkBlocked");
    expect(bodies).toContain("const result = publicationBlocked || query.isError ||");
    expect(bodies).toContain("(!query.isFetchedAfterMount || query.isFetching) && !query.isPlaceholderData");
    expect(bodies).toContain("const result = officeNetworkBlocked || query.isError ||");
    expect(bodies).toContain("!query.isFetchedAfterMount || query.isFetching ? undefined : query.data");
    expect(bodies).toContain("valid && publicationBlocked ? <Unavailable");
    expect(bodies).toContain("valid && officeNetworkBlocked ? <Unavailable");
  });

  it("forces a fresh publication read after reconnect or service recovery", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain('queryKey: ["world", "public", "bodies", slug, term, status, page, connectivity.checkedAt]');
    expect(bodies).toContain('queryKey: ["world", "public", "body", slug, bodySlug, connectivity.checkedAt]');
    expect(bodies).toContain('queryKey: ["world", "public", "body-offices", result?.organization.id, result?.body.id,');
    expect(bodies).toContain("query.dataUpdatedAt, connectivity.checkedAt]");
    // A stale pre-recovery list must not even be reused as placeholder content.
    expect(bodies).toContain("priorQuery?.queryKey[7] === connectivity.checkedAt");
    expect(bodies).toContain("!query.isPlaceholderData");
  });

  it("fails closed while the app's connectivity probe is degraded", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain('const publicationBlocked = connectivity.status !== "online"');
    expect(bodies).toContain('const officeNetworkBlocked = connectivity.status !== "online"');
    expect(bodies).toContain('connectivity.status === "degraded"');
    expect(bodies).toContain("disabled={retryBlocked}");
    expect(bodies).toContain("disabled={officeNetworkBlocked}");
  });

  it("revalidates cached public bodies before revealing them when a route remounts", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    // Directory, body detail and office data each opt into a fresh bounded read
    // when revisited, including while a cached response is still within its TTL.
    expect(bodies.split('refetchOnMount: "always"')).toHaveLength(4);
    expect(bodies).toContain("(!query.isFetchedAfterMount || query.isFetching) && !query.isPlaceholderData");
    expect(bodies).toContain("const result = officeNetworkBlocked || query.isError ||");
    expect(bodies).toContain("!query.isFetchedAfterMount || query.isFetching ? undefined : query.data");
    expect(bodies).toContain("!query.isFetching && !result ? <Unavailable missing />");
    expect(bodies).toContain("offices.isSuccess && offices.isFetchedAfterMount && !offices.isFetching");
    expect(bodies).toContain("offices.isPending || !offices.isFetchedAfterMount || offices.isFetching");
  });

  it("requires a newly verified body snapshot before showing cached office definitions", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain('queryKey: ["world", "public", "body-offices", result?.organization.id, result?.body.id,');
    expect(bodies).toContain("query.dataUpdatedAt, connectivity.checkedAt]");
    expect(bodies).toContain("enabled: !!result && !officeNetworkBlocked");
  });

  it("refuses pre-mount cached publication snapshots even before a refetch begins", () => {
    const bodies = readFileSync(resolve(process.cwd(), "src/components/world/WorldBodiesPublic.tsx"), "utf8");
    expect(bodies).toContain("query.isSuccess && query.isFetchedAfterMount");
    expect(bodies).toContain("(!query.isFetchedAfterMount || query.isFetching) && !query.isPlaceholderData");
    expect(bodies).toContain("!query.isFetchedAfterMount || query.isFetching ? undefined : query.data");
    expect(bodies).toContain("offices.isSuccess && offices.isFetchedAfterMount && !offices.isFetching");
    expect(bodies).toContain("offices.isPending || !offices.isFetchedAfterMount || offices.isFetching");
  });

  it("requires a fresh feature rollout decision on both institutional-body routes", () => {
    const directory = readFileSync(resolve(bodyRoutes, "index.tsx"), "utf8");
    const detail = readFileSync(resolve(bodyRoutes, "$bodySlug.tsx"), "utf8");
    const gate = readFileSync(resolve(process.cwd(), "src/components/world/WorldPublic.tsx"), "utf8");
    expect(directory).toContain("<WorldPublicGate verifyOnMount>");
    expect(detail).toContain("<WorldPublicGate verifyOnMount>");
    expect(gate).toContain('refetchOnMount: verifyOnMount ? "always" : undefined');
    expect(gate).toContain("publicWorldRolloutDisplay(rollout, verifyOnMount)");
    // A route may show cached public bodies only after both its own reader
    // and the canonical rollout flag succeed for the current navigation.
    expect(gate).toContain('publication === "checking"');
    expect(gate).toContain('publication === "disabled"');
  });

  it("keeps stable URL paths for both canonical public body screens", () => {
    const directory = readFileSync(resolve(bodyRoutes, "index.tsx"), "utf8");
    const detail = readFileSync(resolve(bodyRoutes, "$bodySlug.tsx"), "utf8");
    expect(directory).toContain('createFileRoute("/world/organizations/$slug/bodies")');
    expect(detail).toContain('createFileRoute("/world/organizations/$slug_/bodies/$bodySlug")');
  });
});

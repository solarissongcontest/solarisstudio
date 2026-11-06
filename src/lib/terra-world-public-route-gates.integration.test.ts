import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TG3 / TG19 integration boundary. This is intentionally a source/route
 * contract test, not a simulation of Supabase publication or RLS.
 *
 * The WORLD-00 Search/Explore integration introduces additional public World
 * entry points. Every rendering deep link must be gated BEFORE its children
 * mount, even when React Query contains a previously enabled flag.
 * The actual gate state machine and query behavior have their own tests.
 */
const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const worldRoutes = "src/routes/world";
const publicWorldComponents = [
  "index.tsx",
  "organizations/index.tsx",
  "organizations/$slug.tsx",
  "organizations/$slug_/bodies/index.tsx",
  "organizations/$slug_/bodies/$bodySlug.tsx",
  "search/index.tsx",
] as const;

const countryComponents = [
  "countries/index.tsx",
  "countries/$code.tsx",
] as const;

const legacyRedirects = [
  { file: "organizations/$slug_.leadership.tsx", tab: "leadership" },
  { file: "organizations/$slug_.members.tsx", tab: "members" },
] as const;

describe("TG3 public World route publication boundary", () => {
  it.each(publicWorldComponents)(
    "%s checks the rollout again before mounting its public reader",
    (route) => {
      const file = source(`${worldRoutes}/${route}`);
      expect(file).toContain("createFileRoute(");
      expect(file).toMatch(/component:\s*[A-Za-z][A-Za-z0-9]*/);
      // The strict gate is an ancestor of the read component, not just an
      // import or a separate link to another verified screen.
      expect(file).toMatch(/<WorldPublicGate\s+verifyOnMount\s*>/);
      expect(file).toMatch(/<\/WorldPublicGate>/);
    },
  );

  it.each(countryComponents)(
    "%s uses the same fail-closed World publication boundary",
    (route) => {
      const file = source(`${worldRoutes}/${route}`);
      expect(file).toContain("createFileRoute(");
      expect(file).toMatch(/component:\s*[A-Za-z][A-Za-z0-9]*/);
      expect(file).toContain("<WorldCountryRolloutGate>");
      expect(file).toContain("</WorldCountryRolloutGate>");
    },
  );

  it("proves the country gate delegates to the canonical strict gate", () => {
    const file = source("src/components/world/WorldCountryInternational.tsx");
    const start = file.indexOf("export function WorldCountryRolloutGate(");
    expect(start).toBeGreaterThanOrEqual(0);
    const wrapper = file.slice(start, file.indexOf("\n}\n", start) + 2);
    expect(wrapper).toMatch(
      /return\s*<WorldPublicGate\s+verifyOnMount\s*>\{children\}<\/WorldPublicGate>/,
    );
  });

  it.each(legacyRedirects)(
    "$file redirects to the protected canonical organization reader",
    ({ file: route, tab }) => {
      const file = source(`${worldRoutes}/${route}`);
      expect(file).toContain("beforeLoad:");
      expect(file).toContain("throw redirect(");
      expect(file).toContain('to: "/world/organizations/$slug"');
      expect(file).toContain("params: { slug: params.slug }");
      expect(file).toContain(`search: { tab: "${tab}" }`);
      expect(file).toContain("replace: true");
      // A redirect must not mount a second, independently cached projection.
      expect(file).not.toMatch(/component:\s*[A-Za-z][A-Za-z0-9]*/);
      expect(file).not.toContain("useQuery(");
    },
  );

  it("gates all children until a fresh, successful rollout proof exists", () => {
    const gate = source("src/components/world/WorldPublic.tsx");
    const logic = source("src/lib/terra-world-rollout-gate.ts");
    const reader = source("src/lib/terra-world-public.ts");

    expect(gate).toContain('queryKey: ["world", "public", "rollout"]');
    expect(gate).toContain("queryFn: fetchWorldPublicEnabled");
    expect(gate).toContain('refetchOnMount: verifyOnMount ? "always" : undefined');
    expect(gate).toContain("publicWorldRolloutDisplay(rollout, verifyOnMount)");
    expect(gate).toContain('if (publication === "checking")');
    expect(gate).toContain('if (publication === "disabled")');
    expect(gate).toContain('if (publication === "error")');

    const enabled = gate.indexOf('if (publication === "disabled")');
    const release = gate.indexOf("return <>{children}</>", enabled);
    expect(release).toBeGreaterThan(enabled);
    expect(logic).toContain("state.isRefetchError");
    expect(logic).toContain("state.isFetching");
    expect(logic).toContain("verifyOnMount && !state.isFetchedAfterMount");
    expect(logic).toContain('state.data === true ? "enabled" : "disabled"');

    expect(reader).toContain('rpc("studio2_feature_enabled"');
    expect(reader).toContain("p_key: WORLD_PUBLIC_ROLLOUT_KEY");
    expect(reader).toContain("return data === true");
  });

  it("keeps the rendering-route inventory explicit without duplicate route paths", () => {
    const paths = [...publicWorldComponents, ...countryComponents, ...legacyRedirects.map((x) => x.file)];
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(10);
  });
});

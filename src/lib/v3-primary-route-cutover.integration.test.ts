import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const homeRoute = () => source("src/routes/index.tsx");
const participateRoute = () => source("src/routes/participate/index.tsx");
const gate = () => source("src/components/v3/V3PrimaryRouteGate.tsx");
const appRuntime = () => source("src/components/app/AppRuntime.tsx");
const runtime = () => source("src/lib/v3-primary-runtime.ts");
const probe = () => source("src/integrations/v3/rollout-probe.server.ts");
const migration = () =>
  source("supabase/migrations/20261011195500_v3_rollout_feature_flag.sql");

describe("Solaris Studio V3 primary route cutover architecture", () => {
  it("mounts V3 through tiny Home and Participate wrappers while preserving legacy pages", () => {
    const home = homeRoute();
    const participate = participateRoute();

    expect(home).toContain('surface="home" legacy={<LegacyHomePage />}');
    expect(home).toContain("function LegacyHomePage()");
    expect(participate).toContain('surface="participate"');
    expect(participate).toContain("legacy={<LegacyParticipatePage />}");
    expect(participate).toContain("function LegacyParticipatePage()");
  });

  it("does not run legacy Home archive hooks inside the route gate wrapper", () => {
    const home = homeRoute();
    const wrapper = home.slice(
      home.indexOf("function HomePage()"),
      home.indexOf("function LegacyHomePage()"),
    );

    expect(wrapper).toContain("V3PrimaryRouteGate");
    expect(wrapper).not.toContain("useEditions(");
    expect(wrapper).not.toContain("useAllShows(");
    expect(wrapper).not.toContain("useCountries(");
    expect(wrapper).not.toContain("useAllResults(");
  });

  it("does not run legacy Participate queries inside the route gate wrapper", () => {
    const participate = participateRoute();
    const wrapper = participate.slice(
      participate.indexOf("function ParticipatePage()"),
      participate.indexOf("function LegacyParticipatePage()"),
    );

    expect(wrapper).toContain("V3PrimaryRouteGate");
    expect(wrapper).not.toContain("useQuery(");
    expect(wrapper).not.toContain("getPublicRounds");
    expect(wrapper).not.toContain("loadJurySummary");
    expect(wrapper).not.toContain("loadTelevoteSummary");
  });

  it("keeps rollout server-authoritative and fail closed", () => {
    const sourceText = probe();
    const migrationText = migration();

    expect(sourceText).toContain('rpc("studio2_feature_enabled"');
    expect(sourceText).toContain('p_key: "solaris_app_v3"');
    expect(sourceText).toContain("enabled: false");
    expect(sourceText).not.toContain("localStorage");
    expect(sourceText).not.toContain("sessionStorage");
    expect(sourceText).not.toContain("service_role");
    expect(migrationText).toContain("'solaris_app_v3'");
    expect(migrationText).toContain("false,");
  });

  it("keeps the initial platform-detection pass query-free and crawlable before choosing V3 or legacy", () => {
    const gateText = gate();
    const appRuntimeText = appRuntime();

    expect(appRuntimeText).toContain(
      "const [platformResolved, setPlatformResolved] = useState(false)",
    );
    expect(appRuntimeText).toContain("setPlatformResolved(true)");
    expect(gateText).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(gateText).toContain(
      "if (!platformResolved) return <ResolvingPrimarySurface surface={effectiveSurface} />;",
    );
    expect(gateText.indexOf("if (!platformResolved)")).toBeLessThan(
      gateText.indexOf("if (!isAppMode)"),
    );
    const resolvingSurface = gateText.slice(
      gateText.indexOf("function ResolvingPrimarySurface"),
      gateText.indexOf("function V3PrimarySurfaceReadError"),
    );
    expect(resolvingSurface).toContain('data-v3-primary-boot=""');
    expect(resolvingSurface).toContain("<h1");
    expect(resolvingSurface).toContain('"Solaris Today"');
    expect(resolvingSurface).toContain('"Participate in Solaris"');
    expect(resolvingSurface).toContain('href="/countries"');
    expect(resolvingSurface).toContain('href="/confirmations"');
    expect(resolvingSurface).not.toContain("AppShell");
    expect(resolvingSurface).not.toContain("useQuery(");
    expect(gateText).not.toContain('from "@/components/AppShell"');
  });

  it("derives V3 primary content ownership from the live canonical pathname", () => {
    const gateText = gate();

    expect(gateText).toContain("resolveV3PrimarySurface(surface, pathname)");
    expect(gateText).toContain("surface: effectiveSurface");
    expect(gateText).toContain('effectiveSurface === "participate"');
    expect(gateText).toContain('effectiveSurface === "home"');
    expect(gateText).not.toContain('{surface === "home" ? (');
  });

  it("never falls back to the stale route page during a retained primary transition", () => {
    const gateText = gate();

    expect(gateText).toContain("const routeTransitionRetained = effectiveSurface !== surface");
    expect(gateText).toContain("const safeLegacyFallback = routeTransitionRetained ? (");
    expect(gateText).toContain("<ResolvingPrimarySurface surface={effectiveSurface} />");
    expect(gateText).toContain("return safeLegacyFallback");
  });

  it("does not load the expensive bootstrap until the rollout probe permits it", () => {
    const gateText = gate();
    const runtimeText = runtime();

    expect(gateText).toContain("shouldLoadV3PrimaryBundle");
    expect(gateText).toContain("rollout.data?.enabled === true");
    expect(runtimeText).toContain("enabled,");
    expect(runtimeText).toContain('"v3-primary-surface-bundle"');
    expect(runtimeText).toContain('normalizedViewerId ?? "anonymous"');
  });

  it("does not add polling, realtime or a browser rollout escape hatch", () => {
    const combined = [gate(), runtime(), probe()].join("\n");

    for (const forbidden of [
      "refetchInterval",
      "setInterval(",
      ".channel(",
      ".subscribe(",
      "localStorage",
      "sessionStorage",
      "VITE_SOLARIS_APP_V3",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("retains the explicit legacy boundary for critical participation workflows", () => {
    const gateText = gate();
    const participate = participateRoute();

    expect(gateText).toContain("decideV3ShellForRoute");
    expect(participate).toContain('to: "/confirmations"');
    expect(participate).toContain('route: "/jury-voting"');
    expect(participate).toContain('route: "/televoting"');
  });
});
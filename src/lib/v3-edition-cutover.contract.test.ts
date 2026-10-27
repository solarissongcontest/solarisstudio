import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readRoot = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const flags = () => read("lib/feature-flags.ts");
const surfaces = () => read("lib/studio2-product-surfaces.ts");
const migration = () =>
  readRoot("supabase/migrations/20261013123000_v3_edition_hub_rollout_flag.sql");
const notificationsMigration = () =>
  readRoot("supabase/migrations/20261013120000_v3_notifications_rollout_flag.sql");
const probe = () => read("integrations/v3/rollout-probe.server.ts");
const probeFunctions = () => read("lib/v3-rollout-probe.functions.ts");
const primaryRuntime = () => read("lib/v3-primary-runtime.ts");
const source = () => read("integrations/v3/edition-source.server.ts");
const functions = () => read("lib/v3-edition.functions.ts");
const runtime = () => read("lib/v3-edition-runtime.ts");
const gate = () => read("components/v3/V3EditionRouteGate.tsx");
const route = () => read("routes/editions/$slug.tsx");

describe("V3 Edition production cutover", () => {
  it("registers an independent disabled-by-default Edition rollout slice", () => {
    expect(flags()).toContain("solaris_app_v3_edition_hub");
    expect(surfaces()).toContain('key: "solaris_app_v3_edition_hub"');
    expect(surfaces()).toContain('dependsOn: ["solaris_app_v3", "solaris_app_v3_explore"]');
    expect(migration()).toContain("'solaris_app_v3_edition_hub'");
    expect(migration()).toMatch(/'solaris_app_v3_edition_hub'[\s\S]*?false/);
  });

  it("preserves independently shipped Notifications vocabulary after migration ordering", () => {
    expect(notificationsMigration()).toContain("'solaris_app_v3_notifications'");
    expect(migration()).toContain("'solaris_app_v3_notifications'");
    expect(migration()).toContain("'solaris_app_v3_edition_hub'");
  });

  it("keeps rollout evaluation server-authoritative and fail-closed", () => {
    expect(probe()).toContain('p_key: "solaris_app_v3_edition_hub"');
    expect(probe()).toContain("editionHubEnabled");
    expect(probe()).toContain("enabled && exploreEnabled");
    expect(gate()).toContain("rollout.data?.editionHubEnabled === true");
    expect(gate()).toContain("bundleQuery.isError");
    expect(gate()).toContain("return <>{legacy}</>");
  });

  it("evaluates Edition rollout against the edition resolved from the requested route slug", () => {
    const server = probe();
    const targetedStart = server.indexOf("export async function loadV3EditionRolloutProbe");
    const targeted = server.slice(targetedStart);

    expect(targetedStart).toBeGreaterThan(0);
    expect(targeted).toContain("const cleanSlug = slug.trim()");
    expect(targeted).toContain('.select("id")');
    expect(targeted).toContain('.eq("slug", cleanSlug)');
    expect(targeted).toContain('.eq("published", true)');
    expect(targeted).toContain("return evaluateV3Rollout(publicClient, String(editionResult.data.id))");
    expect(probeFunctions()).toContain("loadV3EditionRolloutProbe(data.slug)");
    expect(primaryRuntime()).toContain('["v3-edition-rollout-probe", normalizedSlug]');
    expect(gate()).toContain("useV3EditionRolloutProbe(");
    expect(gate()).not.toContain("useV3RolloutProbe(platformResolved && isAppMode)");
  });

  it("keeps public web legacy and prevents the legacy archive graph from mounting under V3", () => {
    expect(gate()).toContain("if (!isAppMode) return <>{legacy}</>");
    expect(route()).toContain("<V3EditionRouteGate");
    expect(route()).toContain("legacy={<LegacyEditionPage />}");
    expect(route()).toContain("function LegacyEditionPage()");
  });

  it("uses the existing sanitized participant projection and never reads raw participants", () => {
    const server = source();
    expect(server).toContain('client.rpc("public_safe_participants"');
    expect(server).not.toContain('.from("participants")');
    expect(server).toContain('client.rpc("studio2_public_storyline"');
  });

  it("does not query result rows until the canonical show publication gate opens", () => {
    const server = source();
    const resultGate = server.indexOf("const candidateResultShow");
    const resultRead = server.indexOf("await loadPublicResultSnapshots");
    expect(resultGate).toBeGreaterThan(0);
    expect(resultRead).toBeGreaterThan(resultGate);
    expect(server).toContain("snapshot?.editionId === edition.id");
    expect(server).not.toContain('.from("results")');
    expect(server).toContain("resolveShowPublication(show).results");
  });

  it("keeps the browser data boundary narrow and non-authoritative", () => {
    expect(functions()).toContain("z.string().trim().min(1).max(120)");
    expect(functions()).toContain("loadV3EditionBundle({ slug: data.slug })");
    expect(runtime()).toContain('["v3-edition-bundle", normalizedSlug]');
    expect(runtime()).toContain("staleTime: 60_000");
    expect(runtime()).toContain("retry: false");
  });
});

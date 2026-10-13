import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () => read("supabase/migrations/20261013130000_v3_edition_rollout_flag.sql");
const previousMigration = () =>
  read("supabase/migrations/20261013120000_v3_notifications_rollout_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const source = () => read("src/integrations/v3/edition-source.server.ts");
const gate = () => read("src/components/v3/V3EditionRouteGate.tsx");
const route = () => read("src/routes/editions/$slug.tsx");
const runtime = () => read("src/lib/v3-edition-runtime.ts");

function constrainedFlagKeys(sql: string) {
  const constraint = sql.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Edition cutover", () => {
  it("registers an independent Edition slice disabled by default and owned by Explore", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_edition");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_edition).toEqual({ enabled: false });
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_edition.route).toBe("/editions/$slug");
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_edition.dependsOn).toEqual([
      "solaris_app_v3",
      "solaris_app_v3_explore",
    ]);
  });

  it("extends the post-Notifications persisted flag vocabulary without deleting an existing flag", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("solaris_app_v3_explore");
    expect(after).toContain("solaris_app_v3_notifications");
    expect(after).toContain("solaris_app_v3_edition");
    expect(new Set(after).size).toBe(after.length);

    const sql = migration();
    expect(sql).toContain("'solaris_app_v3_edition'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql.slice(sql.indexOf("values ("))).toContain("false,");
  });

  it("derives Edition hub counts through existing publication boundaries rather than raw archive tables", () => {
    const sql = migration();

    expect(sql).toContain("v3_public_edition_hub_counts");
    expect(sql).toContain("public.public_safe_participants(_edition_id, null::uuid)");
    expect(sql).toContain("s.status = 'published'");
    expect(sql).toContain("e.published = true");
    expect(sql).toContain(
      "grant execute on function public.v3_public_edition_hub_counts(uuid) to anon, authenticated, service_role",
    );
    expect(sql).not.toMatch(/from\s+public\.participants\b/i);
  });

  it("requires global V3 plus Explore before the server can enable Edition", () => {
    const code = probe();

    expect(code).toContain('p_key: "solaris_app_v3_edition"');
    expect(code).toContain("editionEnabled: false");
    expect(code).toContain(
      "exploreEnabled && !editionFlag.error && editionFlag.data === true",
    );
  });

  it("loads one publication-safe Edition bundle instead of cloning the legacy archive graph", () => {
    const code = source();

    expect(code).toContain('.eq("slug", cleanSlug)');
    expect(code).toContain('.eq("published", true)');
    expect(code).toContain('client.from("shows")');
    expect(code).toContain('client.from("results")');
    expect(code).toContain('client.rpc("v3_public_edition_hub_counts"');
    expect(code).toContain("buildV3EditionHubProjection");
    expect(code).not.toContain("useAllResults");
    expect(code).not.toContain("useAllShows");
    expect(code).not.toContain("useCountries");
    expect(code).not.toContain("service_role");
  });

  it("keeps clean installed-app URLs V3-gated while canonical section hashes fall back to legacy detail", () => {
    const code = gate();

    expect(code).toContain("LEGACY_EDITION_SECTION_HASHES");
    expect(code).toContain('"edition-overview"');
    expect(code).toContain('"edition-results"');
    expect(code).toContain("rollout.data?.exploreEnabled === true");
    expect(code).toContain("rollout.data?.editionEnabled === true");
    expect(code).toContain("legacyDetailRequested");
    expect(code).toContain("return <>{legacy}</>");
    expect(code).toContain("<V3EditionHubScreen");
    expect(code).not.toContain("localStorage");
    expect(code).not.toContain("sessionStorage");
  });

  it("selects V3 before mounting the legacy Edition data graph", () => {
    const code = route();
    const wrapperStart = code.indexOf("function EditionPage()");
    const legacyStart = code.indexOf("function LegacyEditionPage");
    const wrapper = code.slice(wrapperStart, legacyStart);
    const legacy = code.slice(legacyStart);

    expect(wrapperStart).toBeGreaterThanOrEqual(0);
    expect(legacyStart).toBeGreaterThan(wrapperStart);
    expect(wrapper).toContain("<V3EditionRouteGate");
    expect(wrapper).toContain("legacy={<LegacyEditionPage");
    expect(wrapper).not.toContain("useEdition(");
    expect(wrapper).not.toContain("useAllResults");
    expect(wrapper).not.toContain("useAllShows");
    expect(legacy).toContain("useEdition(slug)");
    expect(legacy).toContain("usePublicEditionParticipants");
  });

  it("keeps the Edition runtime bounded with no polling, retries or window-focus refetch", () => {
    const code = runtime();

    expect(code).toContain('queryKey: ["v3-edition-bundle", normalizedSlug]');
    expect(code).toContain("staleTime: 60_000");
    expect(code).toContain("refetchOnWindowFocus: false");
    expect(code).toContain("retry: false");
    expect(code).not.toContain("refetchInterval");
  });

  it("does not expose a browser-controlled Edition rollout escape hatch", () => {
    const combined = [migration(), probe(), source(), gate(), route(), runtime()].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_EDITION");
    expect(combined).not.toContain('localStorage.getItem("solaris_app_v3_edition"');
    expect(combined).not.toContain('sessionStorage.getItem("solaris_app_v3_edition"');
  });
});

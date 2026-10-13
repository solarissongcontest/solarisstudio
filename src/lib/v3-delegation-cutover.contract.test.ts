import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () => read("supabase/migrations/20261013130000_v3_delegation_cutover.sql");
const previousMigration = () => read("supabase/migrations/20261013123000_v3_edition_hub_rollout_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const source = () => read("src/integrations/v3/delegation-source.server.ts");
const runtime = () => read("src/lib/v3-delegation-runtime.ts");
const route = () => read("src/routes/countries/$code.tsx");
const gate = () => read("src/components/v3/V3DelegationRouteGate.tsx");
const screen = () => read("src/components/v3/V3DelegationScreen.tsx");

function constrainedFlagKeys(sql: string) {
  const constraint = sql.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Delegation production cutover", () => {
  it("registers a separate disabled-by-default Delegation slice under Explore", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_delegation");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_delegation).toEqual({ enabled: false });
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_delegation.route).toBe("/countries/:code");
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_delegation.dependsOn).toEqual([
      "solaris_app_v3",
      "solaris_app_v3_explore",
    ]);
    expect(migration()).toContain("'solaris_app_v3_delegation'");
    expect(migration()).toContain("false,");
  });

  it("extends the Edition-era persisted feature vocabulary without deleting keys", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("public_ia_v3");
    expect(after).toContain("solaris_app_v3_edition_hub");
    expect(after).toContain("solaris_app_v3_delegation");
    expect(new Set(after).size).toBe(after.length);
  });

  it("keeps rollout server-authoritative and dependent on Explore", () => {
    const text = probe();
    expect(text).toContain('p_key: "solaris_app_v3_delegation"');
    expect(text).toContain("delegationEnabled: false");
    expect(text).toContain(
      "enabled && exploreEnabled && !delegationFlag.error && delegationFlag.data === true",
    );
    expect(text).not.toContain("VITE_SOLARIS_APP_V3_DELEGATION");
    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("sessionStorage");
  });

  it("uses public_safe_participants as the publication authority and returns one bounded country profile", () => {
    const sql = migration();
    const server = source();
    expect(sql).toContain("public.public_safe_participants(null, null)");
    expect(sql).toContain("item.value ->> 'country_id' = c.id::text");
    expect(sql).toContain("partition by participant ->> 'edition_id'");
    expect(sql).not.toContain("from public.results");
    expect(sql).not.toContain("from public.jury_votes");
    expect(sql).not.toContain("from public.televotes");
    expect(server).toContain('client.rpc("v3_public_country_profile"');
    expect(server).toContain("buildV3CountryExploreProjection(identity)");
    expect(server).not.toContain("supabaseAdmin");
  });

  it("keeps the app route reversible and prevents legacy archive hooks from mounting under V3", () => {
    const routeSource = route();
    const gateSource = gate();
    expect(routeSource).toContain("<V3DelegationRouteGate");
    expect(routeSource).toContain("legacy={<CountryProfilePage />}" );
    expect(gateSource).toContain("rollout.data?.delegationEnabled === true");
    expect(gateSource).toContain("useV3DelegationBundle(code, shouldLoadBundle)");
    expect(gateSource).toContain("data-v3-delegation-boot");
    expect(gateSource).toContain('activeArea="explore"');
    expect(gateSource).not.toContain("useAllResults");
    expect(gateSource).not.toContain("useAllJuryVotes");
    expect(gateSource).not.toContain("useAllTelevotes");
  });

  it("keeps the Delegation bundle bounded, normalized and non-polling", () => {
    const text = runtime();
    expect(text).toContain('queryKey: ["v3-delegation-bundle", normalizedCode]');
    expect(text).toContain("code.trim().toUpperCase()");
    expect(text).toContain("refetchOnWindowFocus: false");
    expect(text).toContain("retry: false");
    expect(text).not.toContain("refetchInterval");
  });

  it("keeps V3 Delegation presentation free of result and voting authority", () => {
    const text = screen();
    expect(text).toContain("projection.resultsDestination");
    expect(text).toContain("Placements, points and voting analysis remain authoritative");
    expect(text).not.toContain("jury_points");
    expect(text).not.toContain("televote_points");
    expect(text).not.toContain("final_rank");
    expect(text).not.toContain("total_points");
    expect(text).not.toContain("supabase");
    expect(text).not.toContain("useQuery");
  });
});

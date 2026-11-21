import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";

const source = (path: string) => readFileSync(path, "utf8");

const migration = () =>
  source("supabase/migrations/20261013110000_v3_explore_rollout_flag.sql");
const probe = () => source("src/integrations/v3/rollout-probe.server.ts");
const server = () => source("src/integrations/v3/explore-source.server.ts");
const gate = () => source("src/components/v3/V3ExploreRouteGate.tsx");
const route = () => source("src/routes/explore/index.tsx");
const runtime = () => source("src/lib/v3-explore-runtime.ts");

describe("V3 Explore production cutover", () => {
  it("registers an independent Explore rollout slice disabled by default", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_explore");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_explore).toEqual({
      enabled: false,
    });
    expect(migration()).toContain("'solaris_app_v3_explore'");
    expect(migration()).toMatch(/'solaris_app_v3_explore',\s*false/);
    expect(probe()).toContain('p_key: "solaris_app_v3_explore"');
    expect(probe()).toContain("exploreEnabled");
  });

  it("keeps the installed-app Explore cutover server-authoritative and fail closed", () => {
    expect(route()).toContain("V3ExploreRouteGate");
    expect(gate()).toContain("platformResolved && isAppMode");
    expect(gate()).toContain("rollout.data?.exploreEnabled === true");
    expect(gate()).toContain("useV3ExploreBundle(shouldLoadBundle)");
    expect(gate()).toContain("return <>{legacy}</>");
    expect(gate()).toContain("PublicCommandPalette");
    expect(gate()).toContain('data-v3-explore-search-owner="canonical"');
    expect(runtime()).toContain("retry: false");
    expect(runtime()).toContain("refetchOnWindowFocus: false");
  });

  it("uses a narrow publication-safe server projection instead of the legacy archive query graph", () => {
    const implementation = server();
    expect(implementation).toContain("createConfirmationPublicRuntimeClient");
    expect(implementation).toContain('rpc("v3_public_explore_counts")');
    expect(implementation).toContain('.eq("published", true)');
    expect(implementation).toContain("resolveCurrentPublicEdition");
    expect(implementation).toContain("resolvePublicEditionState");
    expect(implementation).toContain("buildV3ExploreRootProjection");
    expect(implementation).not.toContain('@/integrations/supabase/client');
    expect(implementation).not.toContain('.from("participants")');
    expect(implementation).not.toContain("setInterval");
    expect(implementation).not.toContain("subscribe(");
  });

  it("bounds archive preview Show and Result reads to the root surface budget", () => {
    const implementation = server();

    expect(implementation).toContain("const EXPLORE_ARCHIVE_PREVIEW_LIMIT = 4");
    expect(implementation).toContain("const archivePreviewEditions = editions");
    expect(implementation).toContain("edition.id !== currentEdition?.id");
    expect(implementation).toContain("isArchiveEligibleEdition(edition)");
    expect(implementation).toContain(".slice(0, EXPLORE_ARCHIVE_PREVIEW_LIMIT)");
    expect(implementation).toContain("const projectionEditions = [");
    expect(implementation).toContain("const projectionEditionIds = projectionEditions.map");
    expect(implementation).toContain('.in("edition_id", projectionEditionIds)');
    expect(implementation).toContain("editions: projectionEditions.map");
    expect(implementation).not.toContain("publishedEditionIds");
  });

  it("derives aggregate entry counts from the existing public participant projection", () => {
    const sql = migration();
    expect(sql).toContain("v3_public_explore_counts");
    expect(sql).toContain("public.public_safe_participants");
    expect(sql).toContain("studio2_storylines");
    expect(sql).toContain("grant execute on function public.v3_public_explore_counts()");
  });
});

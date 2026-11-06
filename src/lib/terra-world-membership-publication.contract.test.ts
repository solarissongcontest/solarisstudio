import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TG3 membership chronicle public rollout boundary", () => {
  it("checks the canonical server feature flag before either membership read", () => {
    const source = readFileSync(resolve(process.cwd(),
      "src/integrations/v3/terra-world-membership-chronicle.server.ts"), "utf8");
    expect(source).toContain('client.rpc("studio2_feature_enabled"');
    expect(source).toContain('p_key: "terra_world_public"');
    expect(source).toContain("if (error || data !== true)");
    expect(source.split("await requireWorldPublication(client);")).toHaveLength(3);
  });

  it("applies the canonical recognized-institution vocabulary at all public read boundaries", () => {
    const reader = readFileSync(resolve(process.cwd(),
      "src/integrations/v3/terra-world-membership-chronicle.server.ts"), "utf8");
    const decoder = readFileSync(resolve(process.cwd(),
      "src/lib/terra-world-membership-chronicle.ts"), "utf8");
    expect(reader.split('.in("status", [...WORLD_RECOGNIZED_INSTITUTION_STATUSES])')).toHaveLength(4);
    expect(reader.split('select("id,slug,short_name,status,public_visibility"')).toHaveLength(4);
    expect(reader).toContain("if (data) parseWorldChronicleInstitutions([data])");
    expect(decoder).toContain("WORLD_RECOGNIZED_INSTITUTION_STATUSES");
  });

  it("never presents cached identities and membership terms during refetch", () => {
    const source = readFileSync(resolve(process.cwd(),
      "src/components/world/TerraWorldMembershipChronicle.tsx"), "utf8");
    expect(source.split('refetchOnMount: "always"')).toHaveLength(3);
    expect(source).toContain("const verifiedHistory = history.isSuccess && history.isFetchedAfterMount");
    expect(source).toContain("const verifiedInstitutions = institutions.isSuccess && institutions.isFetchedAfterMount");
    expect(source).toContain("!history.isFetching && !history.isRefetchError ? history.data : undefined");
    expect(source).toContain("!institutions.isFetching && !institutions.isRefetchError ? institutions.data : undefined");
    expect(source).toContain("verifiedHistory.records.map");
    expect(source).not.toContain("history.data.records.map");
  });
  it("registers the read-only World chronicle integration with one existing S15 coordinator", () => {
    const registry = readFileSync(resolve(process.cwd(),
      "src/lib/v3-system-zero-orphan-registry.ts"), "utf8");
    const adapterPath = 'src/integrations/v3/terra-world-membership-chronicle.server.ts';
    expect(registry.split('path: "' + adapterPath + '"')).toHaveLength(2);
    expect(registry).toContain(
      'path: "' + adapterPath + '", coordinatorDomain: "public-ux", role: "composite-read-adapter"'
    );
    expect(registry).not.toContain('src/integrations/v3/terra-world-membership-chronicle.server.test.ts');
  });

  it("re-verifies the World rollout before mounting the public membership chronicle", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/world/membership-history/index.tsx"), "utf8");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("<TerraWorldMembershipChronicle />");
    expect(route.indexOf("<WorldPublicGate verifyOnMount>")).toBeLessThan(
      route.indexOf("<TerraWorldMembershipChronicle />"));
  });
});

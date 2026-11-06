import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("V3 personal History authority", () => {
  it("uses one caller-scoped RPC with no browser-selected identity", () => {
    const integration = source("src/integrations/v3/personal-history.server.ts");
    const functions = source("src/lib/v3-personal-history.functions.ts");

    expect(integration).toContain('rpc("v3_my_participation_history")');
    expect(integration).not.toContain("country_accounts");
    expect(integration).not.toContain("userId");
    expect(integration).not.toContain("countryId");
    expect(integration).not.toContain("editionId");
    expect(functions).not.toContain("inputValidator");
  });

  it("cuts installed-app Me History to the native V3 consumer only under rollout", () => {
    const route = source("src/routes/_authenticated/my-solaris/history.tsx");

    expect(route).toContain("useV3RolloutProbe");
    expect(route).toContain("rollout.data.meEnabled === true");
    expect(route).toContain("<V3PersonalHistoryScreen />");
    expect(route).toContain('<MySolarisCountryModule section="history" />');
    expect(route).toContain('content: "noindex, nofollow"');
  });

  it("never reconstructs personal history from current country or public archive data", () => {
    const parser = source("src/lib/v3-personal-history.ts");
    const screen = source("src/components/v3/V3PersonalHistoryScreen.tsx");

    expect(parser).not.toContain("country_accounts");
    expect(screen).not.toContain("country_accounts");
    expect(screen).not.toContain("buildPublicCountryArchive");
    expect(screen).not.toContain("localStorage");
    expect(screen).toContain("caller-scoped History contract");
  });
});

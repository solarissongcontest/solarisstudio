import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/participation-history.server.ts");
const functions = () => read("src/lib/v3-participation-history.functions.ts");
const route = () => read("src/routes/_authenticated/my-solaris/history.tsx");
const screen = () => read("src/components/v3/V3ParticipationHistoryScreen.tsx");

describe("V3 personal participation history architecture", () => {
  it("uses only the recipient-scoped System projection", () => {
    expect(source()).toContain('rpc("v3_my_participation_history")');
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("countryId");
    expect(functions()).not.toContain("editionId");
    expect(source()).not.toContain("owned_hod_edition_history");
    expect(source()).not.toContain("v3_me_confirmation_summary");
    expect(source()).not.toContain("localStorage");
  });

  it("fails closed while System contract #618 is unavailable", () => {
    expect(source()).toContain("missingParticipationHistoryContract");
    expect(source()).toContain("emptyV3ParticipationHistoryBundle");
    expect(screen()).toContain('data-v3-participation-history-state="unavailable"');
  });

  it("binds returned history to the rollout-authenticated viewer", () => {
    expect(route()).toContain("rollout.data.userId");
    expect(route()).toContain("<V3ParticipationHistoryScreen viewerId={rollout.data.userId} />");
    expect(screen()).toContain("history.data.viewerId !== viewerId");
    expect(screen()).toContain('data-v3-participation-history-state="scope-error"');
  });

  it("keeps installed-app cutover reversible and country-history tooling separate", () => {
    expect(route()).toContain("rollout.data.meEnabled === true");
    expect(route()).toContain('<MySolarisCountryModule section="history" />');
    expect(route()).toContain('content: "noindex, nofollow"');
  });
});

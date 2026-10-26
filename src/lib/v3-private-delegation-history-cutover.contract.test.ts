import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 private delegation-history cutover", () => {
  it("routes installed-app Me history to the caller-scoped V3 surface", () => {
    const route = read("src/routes/_authenticated/my-solaris/history.tsx");

    expect(route).toContain("V3DelegationHistoryScreen");
    expect(route).toContain("MySolarisProvider");
    expect(route).toContain("editionId={rollout.data.editionId}");
    expect(route).toContain("useV3RolloutProbe");
    expect(route).toContain("rollout.data?.meEnabled === true");
    expect(route).toContain("viewerId={rollout.data.userId}");
    expect(route).toContain("!country &&");
    expect(route).toContain('return <MySolarisCountryModule section="history" />');
  });

  it("uses the existing caller-bound Me summary instead of the legacy archive/editor graph", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");

    expect(screen).toContain("getV3MeSummary");
    expect(screen).toContain("isScopedV3MeSummary");
    expect(screen).toContain('["v3-me-summary", viewerId]');
    expect(screen).toContain("workspace.user?.id === viewerId");
    expect(screen).toContain("workspace.countryAccount?.access.userId === viewerId");
    expect(screen).not.toContain("useAllParticipants");
    expect(screen).not.toContain("useAllContestEntities");
    expect(screen).not.toContain("useSaveCountryEntry");
    expect(screen).not.toContain("MySolarisCountryModule");
  });

  it("fails closed on viewer/delegation mismatch and preserves canonical archive identity", () => {
    const screen = read("src/components/v3/V3DelegationHistoryScreen.tsx");

    expect(screen).toContain("Private data stayed closed");
    expect(screen).toContain("editionById.get(item.edition_id)");
    expect(screen).toContain("edition?.slug");
    expect(screen).toContain("`/editions/${edition.slug}`");
    expect(screen).not.toContain("slugify(");
    expect(screen).not.toContain("item.edition_name.toLowerCase");
    expect(screen).not.toContain("replaceAll(\" \", \"-\")");
  });

  it("keeps organizer country overrides out of caller-private V3 history", () => {
    const route = read("src/routes/_authenticated/my-solaris/history.tsx");

    expect(route).toContain("platformResolved && isAppMode && !country");
    expect(route).toContain("!country &&");
    expect(route).toContain("explicit Organizer country override");
  });
});

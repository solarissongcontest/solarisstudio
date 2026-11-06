import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Edition } from "./data";
import { resolveActivePublicEdition } from "./v3-discovery-entities";

const makeEdition = (id: string, editionNumber: number, status: string): Edition => ({
  id,
  edition_number: editionNumber,
  name: `SSC ${editionNumber}`,
  status,
  published: true,
  slug: `ssc-${editionNumber}`,
} as Edition);

describe("Public Delegation current-edition authority", () => {
  it("does not treat a completed/archived edition as a current contest", () => {
    const archived = makeEdition("archived", 23, "archived");
    const completed = makeEdition("completed", 22, "post_edition");
    expect(resolveActivePublicEdition([archived, completed])).toBeNull();
    expect(resolveActivePublicEdition([])).toBeNull();
  });

  it("selects the actual published active edition despite a newer archived record", () => {
    const archived = makeEdition("archived", 23, "archived");
    const current = makeEdition("active", 22, "pre_show");
    expect(resolveActivePublicEdition([archived, current])?.id).toBe("active");
    expect(resolveActivePublicEdition([{ ...current, published: false }])).toBeNull();
  });

  it("renders the actual between-editions state in the installed PWA without hiding history", () => {
    const source = readFileSync("src/integrations/v3/delegation-source.server.ts", "utf8");
    const gate = readFileSync("src/components/v3/V3DelegationRouteGate.tsx", "utf8");
    const screen = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
    expect(source).toContain("activeEditionLabel: currentEdition");
    expect(gate).toContain("activeEditionLabel={bundle.activeEditionLabel}");
    expect(screen).toContain('activeEditionLabel === null ? "Between editions" : "Current entry"');
    expect(screen).toContain("No active published edition");
    expect(screen).toContain("Browse this country's published participation history below.");
    expect(screen).toContain("projection.participationHistory.map((entry)");
    expect(screen).toContain("No public entry yet{activeEditionLabel");
  });

  it("uses the canonical public Country ID for the installed-app follow control", () => {
    const source = readFileSync("src/integrations/v3/delegation-source.server.ts", "utf8");
    const gate = readFileSync("src/components/v3/V3DelegationRouteGate.tsx", "utf8");
    const screen = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
    const follow = readFileSync("src/components/FollowButton.tsx", "utf8");

    expect(source).toContain("const countryId = requiredString(country.id");
    expect(source).toContain("countryId: profile.countryId");
    // The legacy Wiki detail URL would redirect to the identical Country page.
    // Use the public Wiki index, which resolves to Reference only when enabled.
    expect(source).toContain('wiki: { label: "Reference", href: "/wiki" }');
    expect(source).not.toContain('href: `/wiki/${code}`');
    expect(gate).toContain("countryId={bundle.countryId}");
    expect(screen).toContain('entityType="country" entityId={countryId} label={projection.name}');
    expect(screen).not.toContain("entityId={projection.code}");
    expect(follow).toContain("useSetFanFollow(user?.id)");
    expect(follow).toContain("aria-pressed={following}");
    expect(follow).toContain('to="/auth"');
    expect(follow).toContain("setFollow.mutateAsync({ entityType, entityId, following: !following })");
  });

  it("uses the same authoritative active edition for published current entry and result slots", () => {
    const source = readFileSync("src/integrations/v3/delegation-source.server.ts", "utf8");
    expect(source).toContain("import { resolveActivePublicEdition }");
    expect(source).toContain("const currentEdition = resolveActivePublicEdition(publishedEditions)");
    expect(source).toContain("parseProfile(profileResult.data, currentEdition?.id ?? null)");
    expect(source).toContain("currentEdition,");
    expect(source).toContain("if (!input.currentEdition) return null");
    expect(source).not.toContain("const currentEdition = resolveCurrentPublicEdition(publishedEditions)");
    expect(source).toContain("eq(\"published\", true)");
    expect(source).toContain('"v3_public_country_profile"');
  });
});

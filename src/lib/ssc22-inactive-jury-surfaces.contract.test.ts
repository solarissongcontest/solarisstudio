import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/jury/$slug.tsx"), "utf8");

describe("inactive jury identities are historical, not live voting options", () => {
  it("only builds the manual jury recipient list from active participants", () => {
    expect(source).toContain("participant.show_id === selectedShow?.id && isCompetingParticipant(participant)");
    expect(source).toContain("const order = useMemo(() => participants.map(");
  });

  it("adds extra Semi-Final juries via an authoritative Organizer command", () => {
    expect(source).toContain('rpc("admin_add_show_jury"');
    expect(source).toContain('kind: missingParticipant ? "country" : "external-country"');
    expect(source).toContain("!showVoters.some((voter) => voter.country_id === country.id)");
  });

  it("excludes withdrawn/disqualified voters even in a stale explicit roster", () => {
    expect(source).toContain("const inactiveCountryIds = useMemo(");
    expect(source).toContain("const inactiveEntityIds = useMemo(");
    expect(source).toContain("resolveShowVoters(activeShowVoters, order, receiverDisplays)");
    expect(source).toContain("[...activeShowVoters].sort");
    expect(source).toContain("!inactiveCountryIds.has(country.id)");
  });
});

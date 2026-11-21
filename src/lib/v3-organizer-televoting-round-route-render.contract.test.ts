import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer televoting round route rendering", () => {
  const parent = source("src/routes/televoting/admin/rounds.tsx");
  const overview = source("src/routes/televoting/admin/rounds/index.tsx");
  const roundGuard = source("src/routes/televoting/admin/rounds/$id.tsx");
  const list = source("src/components/televoting/VotingRoundsView.tsx");

  it("renders the nested route rather than leaving the overview mounted", () => {
    expect(parent).toContain('createFileRoute("/televoting/admin/rounds")');
    expect(parent).toContain("component: Outlet");
    expect(parent).not.toContain("VotingRoundsView");

    expect(overview).toContain('createFileRoute("/televoting/admin/rounds/")');
    expect(overview).toContain("component: VotingRoundsIndexRoute");
    expect(overview).toContain('<VotingRoundsView key={editionId ?? "unscoped"} />');
  });

  it("preserves the edition-and-actor child security guard", () => {
    expect(roundGuard).toContain("votingRoundActorScopeKey(actorId, editionId, roundId)");
    expect(roundGuard).toContain("scopeEdition.solaris_id === editionId");
    expect(roundGuard).toContain("scopeEdition?.rounds.some((round) => round.id === roundId)");
    expect(roundGuard).toContain("return <Outlet />;");
  });

  it("routes both line-up actions to the same editor", () => {
    const link = 'to="/televoting/admin/rounds/$id/entries"';
    expect(list.split(link).length - 1).toBe(2);
    expect(list).toContain("Fix line-up");
    expect(list).toContain("Manage entries");
  });
});

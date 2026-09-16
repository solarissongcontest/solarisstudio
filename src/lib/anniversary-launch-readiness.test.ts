import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const anniversary = source("src/lib/anniversary.ts");
const takeover = source("src/components/AnniversaryTakeover.tsx");
const hub = source("src/routes/anniversary/index.tsx");
const mySolarisShell = source("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
const mySolarisRecap = source("src/components/mysolaris/MySolarisAnniversaryRecap.tsx");
const adminPreview = source("src/routes/_authenticated/admin/anniversary.tsx");

describe("anniversary launch readiness", () => {
  it("uses one shared publication-aware resolved-final guard", () => {
    expect(anniversary).toContain("showResultsArePublished");
    expect(anniversary).toContain("finalRankingIsResolved");
    expect(hub).toContain("showResultsArePublished(show)");
    expect(hub).toContain("finalRankingIsResolved(ranking)");
    expect(mySolarisRecap).toContain("showResultsArePublished(show)");
    expect(mySolarisRecap).toContain("finalRankingIsResolved(ranking)");
  });

  it("keeps latest champion tied to the recap's chronological winner order", () => {
    expect(anniversary).toContain("const grandFinalShows = periodShows");
    expect(anniversary).toContain("const dateCompare = (editionA?.event_date ?? \"\").localeCompare(editionB?.event_date ?? \"\")");
    expect(takeover).toContain("const latestWinner = recap.winners.at(-1) ?? null");
  });

  it("mounts the personalized anniversary recap route-natively in MySolaris", () => {
    expect(mySolarisShell).toContain("<MySolarisAnniversaryRecap />");
    expect(mySolarisRecap).toContain("Your Solaris story");
    expect(mySolarisRecap).toContain("Copy recap");
  });

  it("does not advertise disabled deep portal features as dedicated previews", () => {
    expect(adminPreview).toContain('title: "Countries archive"');
    expect(adminPreview).toContain('title: "Records archive"');
    expect(adminPreview).not.toContain('title: "Country leaderboard"');
  });
});

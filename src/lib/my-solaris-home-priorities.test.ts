import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const context = source("src/components/mysolaris/MySolarisContext.tsx");
const operations = source("src/components/MySolarisOperationsPanel.tsx");

describe("MySolaris home priorities", () => {
  it("keeps the shared context limited to participant capabilities that are in the current product", () => {
    expect(context).toContain('"official_communications"');
    expect(context).toContain('"hod_workspace_v2"');
    expect(context).toContain('"rules_engine"');
    expect(context).not.toContain('"prediction_league"');
    expect(context).not.toContain('"country_voting_dna"');
  });

  it("renders real attention and deadline summaries before generic workspace shortcuts", () => {
    expect(operations).toContain('title="Needs attention"');
    expect(operations).toContain('title="Upcoming"');
    expect(operations).toContain("taskCounts.needsAction");
    expect(operations).toContain("unreadNoticeCount");
    expect(operations).toContain("upcomingDeadlines");
    expect(operations).toContain('title="Edition tools"');
  });

  it("keeps every current-edition workflow directly reachable", () => {
    expect(operations).toContain("NAV_TARGETS.mySolarisTasks");
    expect(operations).toContain("NAV_TARGETS.mySolarisEntry");
    expect(operations).toContain("NAV_TARGETS.mySolarisVoting");
    expect(operations).toContain("NAV_TARGETS.mySolarisNotices");
  });
});

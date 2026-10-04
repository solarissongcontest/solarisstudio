import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const helper = source("src/lib/country-jury-task.ts");
const home = source("src/components/home/HomePersonalAttention.tsx");
const context = source("src/components/mysolaris/MySolarisContext.tsx");

describe("shared participant jury task truth", () => {
  it("uses one country jury resolver for Home and MySolaris", () => {
    expect(home).toContain("loadCountryJuryVotingTask");
    expect(context).toContain("loadCountryJuryVotingTask");
    expect(helper).toContain('"country_jury_voting_context"');
    expect(helper).toContain('candidate.status === "open"');
    expect(helper).toContain("candidate.eligible");
  });

  it("feeds the open jury task into the canonical Participation OS", () => {
    expect(context).toContain("jury: juryQuery.data ?? null");
    expect(context).toContain('queryKey: ["mysolaris-jury-task"');
    expect(context).toContain("refetchInterval: 30_000");
    expect(context).toContain("juryQuery.isLoading");
  });
});

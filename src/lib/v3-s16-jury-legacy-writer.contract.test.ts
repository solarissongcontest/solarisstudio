import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";
import type { V3S16Report } from "./v3-s16-mutation-authority";

const route = readFileSync(new URL("../routes/jury-voting.tsx", import.meta.url), "utf8");

describe("S16 jury ballot legacy writer cutover", () => {
  it("does not invoke the direct legacy ballot RPC from the participant route", () => {
    expect(route).not.toMatch(/\\.rpc\\(\\s*["']submit_country_jury_ballot["']/);
    expect(route).toContain('if (!v3ReliabilityEnabled) {');
    expect(route).toContain('throw new Error("Jury submission is unavailable until the secure voting service is enabled.")');
    expect(route).toContain("const result = await submitBallot({");
    expect(route).toContain("if (!result.receipt)");
  });

  it("continues to reject a reintroduced legacy RPC in the S16 inventory", () => {
    const domains: V3S16Report["domains"] = [{
      id: "jury",
      canonicalOwner: "jury",
      canonicalTables: ["public.jury_votes"],
      canonicalCommands: ["v3_submit_jury_ballot"],
      sanctionedInternalWriters: ["submit_country_jury_ballot"],
      sanctionedWriteTriggers: [],
      ownerBoundary: "shared",
    }];
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      domains,
      files: [{
        path: "src/routes/jury-voting.tsx",
        source: 'await supabase.rpc("submit_country_jury_ballot", { _show_id: showId })',
      }],
      staticOnly: true,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "jury",
        kind: "legacy_application_writer",
        subject: "browser-direct-submit_country_jury_ballot",
        releaseRisk: "hard_blocker",
      }),
    ]));
  });
});

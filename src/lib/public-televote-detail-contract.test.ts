import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const detail = readFileSync("src/components/DetailedTelevoteBreakdown.tsx", "utf8");
const server = readFileSync("src/integrations/televoting/public-detail.server.ts", "utf8");
const show = readFileSync("src/routes/shows/$showId.tsx", "utf8");
const ssc20 = readFileSync(
  "supabase/migrations/20260921170815_reconcile_ssc20_country_source_detail.sql",
  "utf8",
);
const ssc21 = readFileSync(
  "supabase/migrations/20260921173500_reconcile_ssc21_country_source_detail.sql",
  "utf8",
);
const harden = readFileSync(
  "supabase/migrations/20260921162319_harden_public_televote_country_contributions.sql",
  "utf8",
);

describe("public detailed televote", () => {
  it("reads only the sanitized public snapshot", () => {
    expect(server).toContain('from("public_televote_country_contributions")');
    expect(server).not.toContain('from("round_results")');
    expect(server).toContain(
      '"show_id,round_id,round_name,country_code,final_points,activity_points,country_contributions"',
    );
    expect(server).not.toContain('from("round_results")');
    expect(server).not.toContain('from("votes")');
  });

  it("separates official televote points from source contribution units", () => {
    expect(detail).toContain("official televote");
    expect(detail).toContain("source units");
    expect(detail).toContain("are not the same as official televote points");
  });

  it("provides Received and Given source-detail views", () => {
    expect(detail).toContain('type Direction = "received" | "given"');
    expect(detail).toContain("receivedContributors");
    expect(detail).toContain("givenRecipients");
  });

  it("gates the public snapshot with RLS and show publication flags", () => {
    expect(harden).toContain("enable row level security");
    expect(harden).toContain('to anon, authenticated');
    expect(harden).toContain("detailed_voting");
    expect(harden).toContain("televote_results");
  });

  it("reconciles SSC20 source detail and refreshes its public snapshot", () => {
    expect(ssc20).toContain("ssc20_grand_final_country_detailed_pdf_2026_09_09");
    expect(ssc20).toContain("627");
    expect(ssc20).toContain("public_televote_country_contributions");
    expect(ssc20).toContain("snapshot is stale");
  });

  it("builds SSC21 detail from archived observations while keeping canonical official points", () => {
    expect(ssc21).toContain("ssc21_instagram_story_detailed_pdf_2026_09_09");
    expect(ssc21).toContain("704");
    expect(ssc21).toContain("28");
    expect(ssc21).toContain("26");
    expect(ssc21).toContain("public.televote_votes");
    expect(ssc21).toContain("historical:ssc21_instagram_story_voting");
  });

  it("exposes the detail and stats views only through the public show route", () => {
    expect(show).toContain('value: "televote-detail"');
    expect(show).toContain('value: "stats"');
    expect(show).toContain("<DetailedTelevoteBreakdown");
    expect(show).toContain("<ShowVotingStats");
  });
});

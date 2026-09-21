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
const multiSource = readFileSync(
  "supabase/migrations/20260921185254_public_televote_multisource_rounds.sql",
  "utf8",
);

describe("public detailed televote", () => {
  it("reads only the sanitized public snapshot", () => {
    expect(server).toContain('from("public_televote_country_contributions")');
    expect(server).not.toContain('from("round_results")');
    expect(server).toContain(
      '"show_id,round_id,round_name,source_type,display_order,weight_percent,country_code,final_points,raw_score,activity_points,country_contributions"',
    );
    expect(server).not.toContain('from("round_results")');
    expect(server).not.toContain('from("votes")');
  });

  it("keeps official/allocated points distinct from source units", () => {
    expect(detail).toContain("allocated pts");
    expect(detail).toContain("official pts");
    expect(detail).toContain("units");
  });

  it("shows every available televote source as a visible tab with Received and Given views", () => {
    expect(server).toContain("rounds:");
    expect(detail).toContain('role="tablist"');
    expect(detail).toContain('aria-label="Televote sources"');
    expect(detail).toContain("rounds.map");
    expect(detail).toContain('type Direction = "received" | "given"');
    expect(detail).toContain("receivedContributors");
    expect(detail).toContain("givenRecipients");
    expect(detail).not.toContain("Televote source / round");
    expect(detail).not.toContain("Country-source matrix available");
    expect(detail).not.toContain("Recipient totals only");
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

  it("publishes every enabled SSC21 Combined Televote source separately", () => {
    expect(multiSource).toContain("Grand Final round 1");
    expect(multiSource).toContain("Story voting");
    expect(multiSource).toContain("Activity points");
    expect(multiSource).toContain("enabled_source_count <> 3");
    expect(multiSource).toContain("country_contributions");
    expect(multiSource).toContain("raw_score");
    expect(multiSource).toContain("weight_percent");
    expect(multiSource).toContain("Third semi-final");
    expect(multiSource).toContain("49");
    expect(multiSource).toContain("44");
    expect(multiSource).toContain("7");
    expect(multiSource).not.toContain("'Grand final live round'");
  });

  it("exposes the detail and stats views only through the public show route", () => {
    expect(show).toContain('value: "televote-detail"');
    expect(show).toContain('value: "stats"');
    expect(show).toContain("<DetailedTelevoteBreakdown");
    expect(show).toContain("<ShowVotingStats");
  });
});

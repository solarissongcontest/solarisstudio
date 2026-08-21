import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Next in Line competition contract", () => {
  it("has its own route and keeps the old confirmation URL as a redirect only", () => {
    const route = source("src/routes/next-in-line.tsx");
    const legacy = source("src/routes/confirmations/next-in-line.tsx");
    expect(route).toContain('createFileRoute("/next-in-line")');
    expect(route).toContain("NextInLineCompetition");
    expect(legacy).toContain('redirect({ to: "/next-in-line" })');
    expect(legacy).not.toContain("offered a remaining place");
  });

  it("describes Next in Line as unused songs from countries already competing", () => {
    const competition = source("src/components/NextInLineCompetition.tsx");
    expect(competition).toContain("A second competition for songs left behind by countries already competing");
    expect(competition).toContain("This is not a confirmation round");
    expect(competition).toContain("did not win your National Final");
    expect(competition).toContain("not selected");
    expect(competition).toContain("The winning song is excluded automatically");
    expect(competition).toContain("25-second preview start");
    expect(competition).not.toContain("Would you participate if offered a place?");
  });

  it("presents Next in Line separately from Confirmations on Participate", () => {
    const participate = source("src/routes/participate/index.tsx");
    expect(participate).toContain('to="/confirmations"');
    expect(participate).toContain('to="/next-in-line"');
    expect(participate).toContain('title="Next in Line"');
    expect(participate).not.toContain("Join Next in Line when available");
  });
});

describe("country account jury voting contract", () => {
  it("keeps organizer-controlled windows and authenticated-only submission RPCs in the migration", () => {
    const migration = source(
      "supabase/migrations/20260821204500_country_account_jury_voting.sql",
    );
    expect(migration).toContain("create table if not exists public.jury_voting_windows");
    expect(migration).toContain("create table if not exists public.jury_ballot_submissions");
    expect(migration).toContain("admin_set_jury_voting_status");
    expect(migration).toContain("country_jury_voting_context");
    expect(migration).toContain("submit_country_jury_ballot");
    expect(migration).toContain("window_row.status <> 'open'");
    expect(migration).toContain("preflight_row.requires_attestation and preflight_row.attested_at is null");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("uses the same friend-voting math and historical jury plus televote channels", () => {
    const server = source("src/integrations/jury-voting/jury-voting.server.ts");
    expect(server).toContain("calculateFriendVotingRisk");
    expect(server).toContain("loadFriendVotingSettingsServer");
    expect(server).toContain('channel: "televote"');
    expect(server).toContain('channel: "jury"');
    expect(server).toContain("crossChannelEditions");
    expect(server).toContain('channel: "jury",');
  });

  it("warns country accounts about friend voting and requires integrity preflight before submission", () => {
    const route = source("src/routes/jury-voting.tsx");
    expect(route).toContain("Friend voting is not allowed");
    expect(route).toContain("jury and televote");
    expect(route).toContain("preflightCountryJuryVote");
    expect(route).toContain("attestCountryJuryVote");
    expect(route).toContain("VOTE_INTEGRITY_ATTESTATION");
    expect(route).toContain("VOTE_INTEGRITY_CONSEQUENCE");
    expect(route).toContain("DelayedConfirmationState");
    expect(route).toContain("submit_country_jury_ballot");
  });

  it("keeps manual organizer entry while adding open and close controls", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    const control = source("src/components/admin/JuryVotingWindowControl.tsx");
    const manual = source("src/routes/_authenticated/admin/jury/$slug.tsx");
    expect(shell).toContain("JuryVotingWindowControl");
    expect(control).toContain("admin_set_jury_voting_status");
    expect(control).toContain("Open jury voting");
    expect(control).toContain("Close jury voting");
    expect(manual).toContain('rpc("assign_jury_vote"');
    expect(manual).toContain('rpc("clear_jury_point"');
  });

  it("shows Jury voting as a separate country-account service on Participate", () => {
    const participate = source("src/routes/participate/index.tsx");
    expect(participate).toContain('to="/jury-voting"');
    expect(participate).toContain('title="Jury voting"');
    expect(participate).toContain("Country account required");
    expect(participate).toContain("Friend-voting integrity checks");
  });
});

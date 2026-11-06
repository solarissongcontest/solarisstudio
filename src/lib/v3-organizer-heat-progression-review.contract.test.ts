import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/admin/HeatProgressionSyncPanel.tsx"),
  "utf8",
);

describe("V3 Organizer heat progression review boundary", () => {
  it("fails closed unless the route edition matches the selected Organizer edition", () => {
    expect(source).toContain("useAdminContext()");
    expect(source).toContain("const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined");
    expect(source).toContain("useShows(scopedEditionId)");
    expect(source).toContain("organizerEditionId !== edition.id");
    expect(source).toContain("setPendingReview(null)");
  });

  it("previews exact official ranks and complete target membership before review opens", () => {
    expect(source).toContain('supabase.from("results")');
    expect(source).toContain('supabase.from("participants")');
    expect(source).toContain('.eq("edition_id", edition.id)');
    expect(source).toContain("sourceShows.map(sourceReview)");
    expect(source).toContain("candidates.push({");
    expect(source).toContain("finalRank: Number(result.final_rank)");
    expect(source).toContain("participantMembershipFingerprint(liveParticipants, targetShow.id)");
    expect(source).toContain("setPendingReview(review)");
  });

  it("never inserts directly from the review button", () => {
    expect(source).toContain('onClick={() => void requestHeatOutcomeSync("nq"');
    expect(source).toContain('onClick={() => void requestHeatOutcomeSync("qualifier"');
    expect(source).not.toContain('onClick={() => void syncHeatOutcome(');
    expect(source.indexOf("setPendingReview(review)")).toBeLessThan(
      source.indexOf('const { error: insertError } = await (supabase.from("participants") as any).insert(rows)'),
    );
  });

  it("re-reads source shows, qualifier rules, ranks and the full target membership before apply", () => {
    expect(source).toContain('.select("*")');
    expect(source).toContain("sameReviewedSource(source, liveSource)");
    expect(source).toContain("const liveReview = await buildProgressionReview(");
    expect(source).toContain("candidateFingerprint(liveReview.candidates) !== candidateFingerprint(review.candidates)");
    expect(source).toContain("liveReview.targetMembershipFingerprint !== review.targetMembershipFingerprint");
    expect(source).toContain("liveReview.alreadyPresent !== review.alreadyPresent");
    expect(source).toContain("Official heat results or target-show membership changed while this review was open");
  });

  it("refreshes both show rules and participant truth after a rejected or uncertain apply", () => {
    expect(source).toContain('qc.invalidateQueries({ queryKey: ["participants"] })');
    expect(source).toContain('qc.invalidateQueries({ queryKey: ["shows"] })');
  });

  it("applies only the frozen reviewed rows after stale-state checks", () => {
    expect(source).toContain("const rows = review.candidates.map((candidate) => candidate.row)");
    expect(source).toContain('await (supabase.from("participants") as any).insert(rows)');
    expect(source).not.toContain("insert(liveReview.candidates");
    expect(source).toContain("confirmationText={pendingReview?.target.name}");
    expect(source).toContain("Type ${pendingReview.target.name} to confirm");
  });

  it("does not invent versioned or receipted backend authority", () => {
    expect(source).toContain("existing participant insert rather than a canonical versioned progression command/receipt");
    expect(source).toContain("A concurrent change after final revalidation can still make the insert fail");
    expect(source).toContain("refresh canonical state before retrying an uncertain outcome");
  });
});

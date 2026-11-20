import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/televoting/admin/integrity.tsx", "utf8");
const scopedReview = readFileSync(
  "src/components/televoting/V3ScopedIntegrityReview.tsx",
  "utf8",
);

describe("V3 Organizer Voting integrity scope", () => {
  it("requires explicit Organizer edition context at the route boundary", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("if (!editionId)");
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain("edition-scoped Organizer work");
    expect(route).toContain("<V3ScopedIntegrityReview key={editionId} editionId={editionId} />");
    expect(route).not.toContain("IntegrityReviewView");
    expect(route).not.toContain("IntegrityModerationHub");
  });

  it("loads only rounds linked to the exact Solaris edition", () => {
    expect(scopedReview).toContain("getMergedTelevotingRoundsPage");
    expect(scopedReview).toContain("getRoundsPage({ data: { editionId } })");
    expect(scopedReview).toContain('["v3-organizer-integrity-rounds", actorId, editionId]');
    expect(scopedReview).not.toContain("getMergedTelevotingRounds()");
  });

  it("partitions private voting evidence by authenticated actor and evicts inactive cache", () => {
    expect(scopedReview).toContain('import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext"');
    expect(scopedReview).toContain("const actorId = useAuthenticatedUser().id");
    expect(scopedReview).toContain('queryKey: ["v3-organizer-integrity-rounds", actorId, editionId]');
    expect(scopedReview).toContain('queryKey: ["v3-organizer-integrity-submissions", actorId, editionId, roundIds]');
    expect(scopedReview).toContain("enabled: Boolean(actorId)");
    expect(scopedReview).toContain("enabled: Boolean(actorId && roundsQuery.data?.linked && roundIds.length)");
    expect(scopedReview.match(/gcTime: 0/g)).toHaveLength(2);
    expect(scopedReview.match(/retry: false/g)).toHaveLength(2);
    expect(scopedReview.match(/refetchInterval: false/g)).toHaveLength(2);
    expect(scopedReview.match(/refetchOnWindowFocus: false/g)).toHaveLength(2);
    expect(scopedReview.match(/refetchOnReconnect: false/g)).toHaveLength(2);
    expect(scopedReview).not.toContain("refetchInterval: 60_000");
    expect(scopedReview).toContain("roundsQuery.refetch()");
    expect(scopedReview).toContain("submissionsQuery.refetch()");
    expect(scopedReview).toContain("Evidence unavailable");
    expect(scopedReview).toContain("!loading && !error");
  });

  it("never uses the global all-round moderation read", () => {
    expect(scopedReview).toContain("roundIds.map(async (scopedRoundId)");
    expect(scopedReview).toContain("listVotes({ data: { roundId: scopedRoundId } })");
    expect(scopedReview).toContain("submission.round_id !== scopedRoundId");
    expect(scopedReview).toContain("returned a ballot outside the selected edition round scope");
    expect(scopedReview).not.toContain("roundId: null");
  });

  it("keeps global human-moderation commands unavailable until server edition scope exists", () => {
    expect(scopedReview).toContain("Human moderation is temporarily read-only here");
    expect(scopedReview).toContain("server verifies edition ownership for every command");
    expect(scopedReview).not.toContain("setMergedSubmissionStatus");
    expect(scopedReview).not.toContain("softDeleteMergedSubmission");
    expect(scopedReview).not.toContain("getMergedIntegrityModeration");
    expect(scopedReview).not.toContain("createMergedIntegritySanction");
  });
});

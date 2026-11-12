import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/televoting/admin/editions.tsx", "utf8");

describe("Organizer Televote edition-link repair review actor isolation", () => {
  it("requires a new confirmation when the signed-in account changes", () => {
    expect(route).toContain("const actorId = useAuthenticatedUser().id;");
    expect(route).toContain("const currentActorRef = useRef(actorId);");
    expect(route).toContain("currentActorRef.current = actorId;");
    expect(route).toContain("const [repairReviewActorId, setRepairReviewActorId] = useState<string | null>(null);");
    expect(route).toContain("const repairOpen = repairReviewActorId === actorId;");
    expect(route).toContain("}, [actorId]);");
    expect(route).toContain("setRepairReviewActorId(null);");
    expect(route).toContain("setRepairReviewActorId(actorId)");
    expect(route).not.toContain("const [repairOpen, setRepairOpen] = useState(false);");
  });

  it("prevents a prior account's still-open review from launching a new repair", () => {
    expect(route).toContain("mutationFn: async (reviewActorId: string) => {");
    expect(route).toContain("if (!reviewActorId || reviewActorId !== currentActorRef.current)");
    expect(route).toContain("throw new Error(\"Voting edition repair review expired after account change. Open a new review.\")");
    expect(route).toContain("if (repairOpen && !error && !isLoading && !isFetching && !repairMutation.isPending)");
    expect(route).toContain("repairMutation.mutate(actorId)");
  });

  it("does not show prior-account repair completion or failure to the new account", () => {
    expect(route).toContain("onSuccess: async (_result, reviewActorId) => {");
    expect(route).toContain("if (currentActorRef.current === reviewActorId) {");
    expect(route).toContain("toast.success(\"Voting edition links repaired\")");
    expect(route).toContain("onError: (caught, reviewActorId) => {");
    expect(route).toContain("if (currentActorRef.current !== reviewActorId) return;");
  });

  it("does not replace the canonical writer or weaken local-only test isolation", () => {
    expect(route).toContain("syncMergedTelevotingEditionCatalog");
    expect(route).toContain("syncCatalog()");
    expect(route).not.toContain("supabase.from(");
    expect(route).not.toContain("https://");
  });
});

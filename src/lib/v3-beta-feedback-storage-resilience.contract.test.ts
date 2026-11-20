import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 beta feedback storage resilience", () => {
  it("routes every beta-test storage access through the fail-soft helper", () => {
    const route = read("src/routes/beta-test/index.tsx");

    expect(route).toContain("readPublicBetaFeedbackStorage");
    expect(route).toContain("writePublicBetaFeedbackStorage");
    expect(route).toContain("removePublicBetaFeedbackStorage");
    expect(route).not.toContain("window.localStorage");
  });

  it("keeps successful server submission authoritative over local bookkeeping", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const insert = route.indexOf('.insert(payload as never);');
    const removeDraft = route.indexOf("removePublicBetaFeedbackStorage(BETA_DRAFT_KEY)", insert);
    const markSubmitted = route.indexOf(
      'writePublicBetaFeedbackStorage(BETA_SUBMITTED_KEY, "true")',
      insert,
    );
    const renderSuccess = route.indexOf("setSubmitted(true)", insert);

    expect(insert).toBeGreaterThan(0);
    expect(removeDraft).toBeGreaterThan(insert);
    expect(markSubmitted).toBeGreaterThan(insert);
    expect(renderSuccess).toBeGreaterThan(insert);
    expect(route.slice(insert, renderSuccess)).toContain(
      "Browser\n      // storage is optional bookkeeping",
    );
  });

  it("does not turn storage availability into submission authority", () => {
    const helper = read("src/lib/public-beta-feedback-storage.ts");

    expect(helper).toContain("Local draft/marker state is a convenience only");
    expect(helper).toContain("return false");
    expect(helper).not.toContain("supabase");
    expect(helper).not.toContain("beta3_test_submissions");
  });
});

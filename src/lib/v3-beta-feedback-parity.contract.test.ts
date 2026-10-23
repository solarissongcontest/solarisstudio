import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function betaCapabilityBlock(registry: string) {
  const start = registry.indexOf('id: "beta-test-feedback"');
  const end = registry.indexOf('id: "terraos-teaser-preview"', start);
  if (start < 0 || end < 0) throw new Error("Beta feedback capability row is missing");
  return registry.slice(start, end);
}

describe("Public V3 Beta feedback parity", () => {
  it("keeps the usability study restricted instead of promoting it into normal V3 discovery", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const registry = betaCapabilityBlock(
      read("src/lib/v3-public-capability-supplements.ts"),
    );

    expect(route).toContain('{ name: "robots", content: "noindex,nofollow" }');
    expect(registry).toContain('classification: "restrict"');
    expect(registry).toContain('targetArea: "contextual"');
    expect(registry).toContain('targetRoute: "/beta-test"');
    expect(registry).toContain('specificationStatus: "parity"');
    expect(registry).toContain('acceptanceScenarioId: "public.beta-feedback-restricted-surface"');
  });

  it("keeps draft and submitted markers fail-soft and non-authoritative", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const storage = read("src/lib/public-beta-feedback-storage.ts");

    expect(route).toContain("readPublicBetaFeedbackStorage");
    expect(route).toContain("writePublicBetaFeedbackStorage");
    expect(route).toContain("removePublicBetaFeedbackStorage");
    expect(route).not.toContain("window.localStorage");

    expect(storage).toContain('Pick<Storage, "getItem" | "setItem" | "removeItem">');
    expect(storage).toContain('if (typeof window === "undefined") return null');
    expect(storage).toContain("return false;");
    expect(storage).toContain("return null;");
  });

  it("persists verified screenshot continuity before the authoritative submission write", () => {
    const route = read("src/routes/beta-test/index.tsx");

    const uploadIndex = route.indexOf("await uploadBetaFeedbackScreenshot({");
    const draftIndex = route.indexOf(
      "persistBetaDraft({ answers, bugs: workingBugs, step });",
      uploadIndex,
    );
    const insertIndex = route.indexOf('.from("beta3_test_submissions" as never)', draftIndex);

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(draftIndex).toBeGreaterThan(uploadIndex);
    expect(insertIndex).toBeGreaterThan(draftIndex);
    expect(route).toContain("screenshot_paths: screenshotPaths");
    expect(route).toContain("previousBug?.screenshotPath");
    expect(route).toContain("screenshotPath: undefined");
  });

  it("cannot turn an accepted server submission into a fake failure through optional local bookkeeping", () => {
    const route = read("src/routes/beta-test/index.tsx");

    const insertIndex = route.indexOf('.from("beta3_test_submissions" as never)');
    const insertErrorIndex = route.indexOf("if (insertError) throw insertError;", insertIndex);
    const cleanupIndex = route.indexOf(
      "removePublicBetaFeedbackStorage(BETA_DRAFT_KEY);",
      insertErrorIndex,
    );
    const markerIndex = route.indexOf(
      'writePublicBetaFeedbackStorage(BETA_SUBMITTED_KEY, "true");',
      cleanupIndex,
    );

    expect(insertIndex).toBeGreaterThan(-1);
    expect(insertErrorIndex).toBeGreaterThan(insertIndex);
    expect(cleanupIndex).toBeGreaterThan(insertErrorIndex);
    expect(markerIndex).toBeGreaterThan(cleanupIndex);
  });

  it("uses bounded verified screenshots and privacy-minimised context/error handling", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const upload = read("src/lib/beta-feedback-upload.ts");
    const safety = read("src/lib/public-beta-feedback-safety.ts");
    const context = read("src/lib/v3-beta-feedback-context.ts");
    const events = read("src/lib/public-ux-events.ts");

    expect(upload).toContain('domain: "beta_feedback"');
    expect(upload).toContain("uploadVerifiedFile");
    expect(upload).toContain('"image/png"');
    expect(upload).toContain('"image/jpeg"');
    expect(upload).toContain('"image/webp"');
    expect(upload).toContain("MAX_BETA_SCREENSHOT_BYTES = 5 * 1024 * 1024");

    expect(route).toContain("user_agent: null");
    expect(route).not.toContain("navigator.userAgent");
    expect(route).toContain("readV3BetaFeedbackContext()");
    expect(context).not.toContain("screen.width");
    expect(context).not.toContain("screen.height");
    expect(context).not.toContain("geolocation");
    expect(context).not.toContain("devicePixelRatio");
    expect(safety).toContain("Your draft is still saved on this device");
    expect(events).toContain("query_length");
    expect(events).not.toContain("query_text");
    expect(events).not.toContain("message_body");
    expect(events).not.toContain("vote_contents");
  });
});

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

  it("preserves a local draft across failed submissions without persisting secret workflow authority", () => {
    const route = read("src/routes/beta-test/index.tsx");

    expect(route).toContain("BETA_DRAFT_KEY");
    expect(route).toContain("window.localStorage.setItem(");
    expect(route).toContain("window.localStorage.removeItem(BETA_DRAFT_KEY)");
    expect(route).toContain("setError(publicBetaFeedbackErrorMessage(submissionError))");
    expect(route).not.toContain("submissionError.message");
  });

  it("uses the verified bounded screenshot pipeline", () => {
    const upload = read("src/lib/beta-feedback-upload.ts");

    expect(upload).toContain('domain: "beta_feedback"');
    expect(upload).toContain("uploadVerifiedFile");
    expect(upload).toContain('"image/png"');
    expect(upload).toContain('"image/jpeg"');
    expect(upload).toContain('"image/webp"');
    expect(upload).toContain("MAX_BETA_SCREENSHOT_BYTES = 5 * 1024 * 1024");
    expect(upload).toContain('receipt.bucket !== "beta-feedback"');
  });

  it("keeps public errors and telemetry privacy-minimised", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const safety = read("src/lib/public-beta-feedback-safety.ts");
    const events = read("src/lib/public-ux-events.ts");

    expect(route).toContain("user_agent: null");
    expect(route).not.toContain("navigator.userAgent");
    expect(safety).toContain("Your draft is still saved on this device");
    expect(events).toContain("query_length");
    expect(events).not.toContain("query_text");
    expect(events).not.toContain("message_body");
    expect(events).not.toContain("vote_contents");
  });
});

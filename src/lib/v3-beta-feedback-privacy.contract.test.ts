import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Beta feedback privacy boundary", () => {
  it("keeps the public study restricted from indexing and normal discovery", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const supplement = read("src/lib/v3-public-capability-supplements.ts");

    expect(route).toContain('{ name: "robots", content: "noindex,nofollow" }');
    expect(supplement).toContain('id: "beta-test-feedback"');
    expect(supplement).toContain('classification: "restrict"');
  });

  it("does not persist the full browser user-agent", () => {
    const route = read("src/routes/beta-test/index.tsx");

    expect(route).toContain("user_agent: null");
    expect(route).not.toContain("navigator.userAgent");
    expect(route).toContain("not your full browser user-agent string");
  });

  it("never reflects arbitrary backend or storage error text into the public UI", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const safety = read("src/lib/public-beta-feedback-safety.ts");

    expect(route).toContain("setError(publicBetaFeedbackErrorMessage(submissionError))");
    expect(route).not.toContain("submissionError.message");
    expect(route).not.toContain("console.error(\"Beta feedback submission failed\"");
    expect(safety).toContain("Backend, RLS");
    expect(safety).toContain("Your draft is still saved on this device");
  });

  it("keeps only immediately actionable screenshot validation errors public", () => {
    const safety = read("src/lib/public-beta-feedback-safety.ts");

    expect(safety).toContain("not a supported image type");
    expect(safety).toContain('empty: "is empty"');
    expect(safety).toContain("error instanceof BetaScreenshotValidationError");
    expect(safety).toContain("larger than 5 MB");
    expect(safety).not.toContain("unexpected bucket");
  });

  it("keeps navigation telemetry privacy-minimised and separate from form contents", () => {
    const route = read("src/routes/beta-test/index.tsx");
    const events = read("src/lib/public-ux-events.ts");

    expect(route).toContain("It does not record search text, votes, messages, form contents or Integrity evidence.");
    expect(events).toContain("query_length");
    expect(events).not.toContain("query_text");
    expect(events).not.toContain("message_body");
    expect(events).not.toContain("vote_contents");
  });

  it("honors browser privacy signals and sanitizes diagnostic route identity", () => {
    const events = read("src/lib/public-ux-events.ts");
    const privacy = read("src/lib/public-ux-privacy.ts");
    const metrics = read("src/lib/public-ux-metrics.ts");

    expect(events).toContain("privacyAllowsPublicUxTelemetry()");
    expect(events).toContain("window.localStorage.removeItem(SESSION_KEY)");
    expect(events).toContain("sanitizePublicUxPath(window.location.pathname)");
    expect(events).toContain("sanitizePublicUxTarget(options.target)");
    expect(privacy).toContain("globalPrivacyControl");
    expect(privacy).toContain('doNotTrack !== "1"');
    expect(privacy).toContain("UUID_SEGMENT");
    expect(privacy).toContain("LONG_SECRETISH_SEGMENT");
    expect(metrics).toContain("sanitizePublicUxPath(String(item.pathname ?? \"/\"))");
    expect(metrics).toContain("sanitizePublicUxTarget(String(item?.target ?? \"\"))");
  });
});

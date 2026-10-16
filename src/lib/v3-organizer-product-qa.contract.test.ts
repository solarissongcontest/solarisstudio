import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const more = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const studies = readFileSync(
  "src/routes/_authenticated/admin/feedback-studies.tsx",
  "utf8",
);
const legacyRedirect = readFileSync(
  "src/routes/_authenticated/admin/beta-feedback.tsx",
  "utf8",
);

describe("V3 Organizer Product QA information architecture", () => {
  it("exposes one canonical Feedback Studies entry from Product QA", () => {
    expect(more).toContain('title: "Product QA"');
    expect(more).toContain('label: "Feedback Studies"');
    expect(more).toContain('to: "/admin/feedback-studies"');
    expect(more).not.toContain('label: "Beta 3 feedback"');
    expect(more).not.toContain('label: "Beta 2 feedback"');
    expect(more).not.toContain('label: "Beta 1 archive"');
  });

  it("keeps Beta 1, Beta 2 and Beta 3 as distinct historical datasets", () => {
    expect(studies).toContain('id: "beta-1"');
    expect(studies).toContain('id: "beta-2"');
    expect(studies).toContain('id: "beta-3"');
    expect(studies).toContain('to: "/admin/beta1-feedback"');
    expect(studies).toContain('to: "/admin/beta2-feedback"');
    expect(studies).toContain('to: "/admin/beta3-feedback"');
    expect(studies).toContain(
      "The V3 workspace consolidates navigation, not source data.",
    );
  });

  it("keeps the old generic feedback URL compatible with the new hub", () => {
    expect(legacyRedirect).toContain(
      '<Navigate to="/admin/feedback-studies" replace />',
    );
  });

  it("keeps acceptance, coverage and public UX as separate QA authorities", () => {
    expect(more).toContain('label: "Organizer Acceptance Test"');
    expect(more).toContain('label: "QA Coverage"');
    expect(more).toContain('label: "Public UX"');
    expect(studies).toContain('to="/admin/beta-test"');
    expect(studies).toContain('to="/admin/admin-beta-feedback"');
    expect(studies).toContain('to="/admin/public-ux"');
  });
});

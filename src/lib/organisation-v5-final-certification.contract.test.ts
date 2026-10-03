import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 final certification contract", () => {
  const manifest = source("docs/organisation-os-v5/release-certification.yml");
  const readiness = source("scripts/check-organisation-os-v5-release-readiness.mjs");
  const workflow = source(".github/workflows/organisation-os-v5-certification.yml");
  const browser = source(".github/workflows/browser-audit.yml");
  const organizerE2E = source("e2e/organizer-routes.e2e.ts");

  it("binds certification evidence to one exact implementation commit", () => {
    expect(manifest).toContain('source_commit: ""');
    expect(readiness).toContain("exact 40-character release candidate SHA");
    expect(readiness).toContain('git(["merge-base", "--is-ancestor", sourceCommit, headCommit])');
    expect(readiness).toContain('git(["diff", "--name-only", `${sourceCommit}..HEAD`])');
    expect(readiness).toContain("certification evidence is stale because implementation changed");
  });

  it("requires the V5 manual gates that automated browser tests cannot honestly prove", () => {
    for (const gate of [
      "physical-iphone-portrait",
      "physical-iphone-landscape",
      "phone-only-simulated-edition",
      "r3-two-operator-physical",
      "failure-injection-network-and-concurrency",
      "failure-injection-auth-and-permissions",
      "degraded-offline-and-maintenance",
      "task-inbox-push-recovery",
      "immutable-audit-and-operation-receipts",
      "production-organizer-smoke",
    ]) {
      expect(manifest).toContain(`- id: ${gate}`);
    }
  });

  it("requires all same-source automated safety gates before sign-off", () => {
    expect(workflow).toContain('"Quality"');
    expect(workflow).toContain('"Browser audit"');
    expect(workflow).toContain('"Rules + Integrity migration rehearsal"');
    expect(workflow).toContain('run.conclusion === "success"');
    expect(workflow).toContain("head_sha: source");
    expect(workflow).toContain("bun run budget:client");
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun test");
    expect(workflow).toContain("bun run certify:organisation-v5");
  });

  it("makes authenticated Organizer browser coverage mandatory rather than skippable CI decoration", () => {
    expect(browser).toContain("Seed authenticated local browser accounts");
    expect(organizerE2E).toContain(
      "refusing to skip authenticated Organizer coverage in CI",
    );
    expect(organizerE2E).toContain(
      "Browser Audit must seed both local Organizers and the local Country account for R3 certification.",
    );
    expect(organizerE2E).toContain(
      "R3 permission changes require a second Organizer on mobile",
    );
  });
});

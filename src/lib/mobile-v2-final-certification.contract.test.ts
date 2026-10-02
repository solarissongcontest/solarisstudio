import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Mobile V2 final certification contract", () => {
  it("binds manual evidence to one explicit source commit", () => {
    const manifest = source("docs/mobile-v2/release-certification.yml");
    const readiness = source("scripts/check-mobile-v2-release-readiness.mjs");

    expect(manifest).toContain('source_commit: ""');
    expect(readiness).toContain("source_commit");
    expect(readiness).toContain("40-character release candidate SHA");
    expect(readiness).toContain('git(["merge-base", "--is-ancestor", sourceCommit, headCommit])');
  });

  it("rejects implementation changes after the reviewed source commit", () => {
    const readiness = source("scripts/check-mobile-v2-release-readiness.mjs");

    expect(readiness).toContain('git(["diff", "--name-only", `${sourceCommit}..HEAD`])');
    expect(readiness).toContain('"docs/mobile-v2/release-certification.yml"');
    expect(readiness).toContain("implementationChanges");
    expect(readiness).toContain("certification evidence is stale");
  });

  it("requires all automated release workflows green on the reviewed source commit", () => {
    const workflow = source(".github/workflows/mobile-v2-certification.yml");

    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("head_sha: source");
    expect(workflow).toContain('"Quality"');
    expect(workflow).toContain('"Browser audit"');
    expect(workflow).toContain('"Rules + Integrity migration rehearsal"');
    expect(workflow).toContain('run.conclusion === "success"');
  });
});

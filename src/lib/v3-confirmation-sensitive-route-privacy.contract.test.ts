import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const SENSITIVE_CONFIRMATION_ROUTES = [
  "src/routes/confirmations/edit/$token.tsx",
  "src/routes/confirmations/recover.tsx",
] as const;

describe("V3 Confirmation sensitive-route privacy", () => {
  it("keeps credential-bearing Confirmation access surfaces out of indexing and crawler link-following", () => {
    for (const path of SENSITIVE_CONFIRMATION_ROUTES) {
      const route = source(path);
      expect(route, path).toContain(
        '{ name: "robots", content: "noindex, nofollow" }',
      );
      expect(route, path).not.toContain(
        '{ name: "robots", content: "noindex" }',
      );
    }
  });

  it("preserves the canonical recovery-to-edit-token handoff", () => {
    const recovery = source("src/routes/confirmations/recover.tsx");
    const edit = source("src/routes/confirmations/edit/$token.tsx");

    expect(recovery).toContain("recoverSubmission");
    expect(recovery).toContain("/confirmations/edit/${encodeURIComponent(result.token)}");
    expect(edit).toContain('createFileRoute("/confirmations/edit/$token")');
    expect(edit).toContain("resolveEditToken");
  });
});

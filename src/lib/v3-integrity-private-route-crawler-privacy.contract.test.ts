import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const privateIntegrityRoutes = [
  "src/routes/integrity/appeals.tsx",
  "src/routes/integrity/appeal.$caseId.tsx",
  "src/routes/integrity/anonymous-appeal.tsx",
  "src/routes/integrity/preclearance.tsx",
  "src/routes/integrity/recover.tsx",
  "src/routes/integrity/cases/index.tsx",
  "src/routes/integrity/cases/$caseId.tsx",
] as const;

describe("V3 private Integrity crawler policy", () => {
  it.each(privateIntegrityRoutes)("keeps %s non-indexable and non-followable", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(source).not.toContain('{ name: "robots", content: "noindex" }');
  });
});

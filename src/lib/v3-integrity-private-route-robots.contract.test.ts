import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PRIVATE_INTEGRITY_ROUTES = [
  "src/routes/integrity/appeals.tsx",
  "src/routes/integrity/appeal.$caseId.tsx",
  "src/routes/integrity/anonymous-appeal.tsx",
  "src/routes/integrity/cases/index.tsx",
  "src/routes/integrity/cases/$caseId.tsx",
  "src/routes/integrity/recover.tsx",
  "src/routes/integrity/preclearance.tsx",
] as const;

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Integrity private-route crawler policy", () => {
  it.each(PRIVATE_INTEGRITY_ROUTES)(
    "%s refuses both indexing and link following",
    (path) => {
      const route = source(path);

      expect(route).toContain(
        '{ name: "robots", content: "noindex, nofollow" }',
      );
      expect(route).not.toContain(
        '{ name: "robots", content: "noindex" }',
      );
    },
  );
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const privateConfirmationRoutes = [
  "src/routes/confirmations/recover.tsx",
  "src/routes/confirmations/edit/$token.tsx",
] as const;

describe("V3 private Confirmation crawler policy", () => {
  it.each(privateConfirmationRoutes)("keeps %s non-indexable and non-followable", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(source).not.toContain('{ name: "robots", content: "noindex" }');
  });
});

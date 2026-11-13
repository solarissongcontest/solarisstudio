import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = (path: string) => readFileSync(path, "utf8");

const SENSITIVE_ROUTES = [
  "src/routes/confirmations/edit/$token.tsx",
  "src/routes/confirmations/recover.tsx",
] as const;

describe("Confirmation sensitive route privacy", () => {
  it("disallows indexing, crawler following and referrer disclosure on private routes", () => {
    for (const path of SENSITIVE_ROUTES) {
      const source = route(path);
      expect(source, path).toContain('{ name: "robots", content: "noindex, nofollow" }');
      expect(source, path).toContain('{ name: "referrer", content: "no-referrer" }');
      expect(source, path).not.toContain('{ name: "robots", content: "noindex" }');
    }
  });

  it("does not disturb the server-owned recovery-to-edit-token flow", () => {
    const recovery = route("src/routes/confirmations/recover.tsx");
    const edit = route("src/routes/confirmations/edit/$token.tsx");
    expect(recovery).toContain("recoverSubmission");
    expect(recovery).toContain("/confirmations/edit/${encodeURIComponent(result.token)}");
    expect(edit).toContain('createFileRoute("/confirmations/edit/$token")');
    expect(edit).toContain("resolveEditToken");
  });
});

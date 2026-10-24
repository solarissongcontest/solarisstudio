import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PRIVATE_VOTING_ROUTES = [
  "src/routes/televoting/admin/rounds.tsx",
  "src/routes/televoting/admin/results.tsx",
  "src/routes/televoting/admin/audit-log.tsx",
  "src/routes/televoting/admin/accounts.tsx",
  "src/routes/televoting/admin/sign-in.tsx",
] as const;

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Organizer Televoting private-route crawler policy", () => {
  it.each(PRIVATE_VOTING_ROUTES)(
    "%s refuses indexing and crawler link-following",
    (path) => {
      const route = source(path);

      expect(route).toContain('name: "robots", content: "noindex, nofollow"');
      expect(route).not.toContain('name: "robots", content: "noindex" }');
    },
  );

  it("keeps the heavy voting audit projection user-refreshed instead of polling", () => {
    const auditLog = source("src/routes/televoting/admin/audit-log.tsx");

    expect(auditLog).toContain("staleTime: 30_000");
    expect(auditLog).toContain("refetchOnWindowFocus: false");
    expect(auditLog).toContain("void refetch()");
    expect(auditLog).not.toContain("refetchInterval:");
  });
});

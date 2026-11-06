import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const PRIVATE_VOTING_ROUTES = [
  "src/routes/televoting/admin/rounds.tsx",
  "src/routes/televoting/admin/results.tsx",
  "src/routes/televoting/admin/audit-log.tsx",
  "src/routes/televoting/admin/accounts.tsx",
  "src/routes/televoting/admin/sign-in.tsx",
] as const;

describe("V3 Organizer Televote private route crawler policy", () => {
  it.each(PRIVATE_VOTING_ROUTES)("marks %s non-indexable and non-followable", path => {
    const route = source(path);
    expect(route).toContain('name: "robots", content: "noindex, nofollow"');
    expect(route).not.toContain('name: "robots", content: "noindex" }');
  });

  it("retains the merged account-scoped audit reader and user-refresh UX", () => {
    const audit = source("src/routes/televoting/admin/audit-log.tsx");
    expect(audit).toContain("useAuthenticatedUser().id");
    expect(audit).toContain('queryKey: ["merged-televoting-audit", actorId, action, targetType]');
    expect(audit).toContain("gcTime: 0");
    expect(audit).toContain("refetchInterval: false");
    expect(audit).toContain("refetchOnWindowFocus: false");
    expect(audit).toContain("refetchOnReconnect: false");
    expect(audit).toContain('onClick={() => void refetch()}');
    expect(audit).not.toContain("useNavigate");
  });
});

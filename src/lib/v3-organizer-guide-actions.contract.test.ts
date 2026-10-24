import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildV3OrganizerControlGroups, v3OrganizerTabRoot } from "./v3-organizer";

const route = readFileSync("src/routes/_authenticated/admin/guide.tsx", "utf8");
const actions = readFileSync("src/components/admin/OrganizerGuideActions.tsx", "utf8");

const COMMON_KEYS = [
  ["delegations", "confirmations"],
  ["contest", "entry-review"],
  ["voting", "voting-overview"],
  ["results", "results"],
  ["communications", "communications"],
  ["production", "broadcast"],
] as const;

function commonHrefs(slug: string | null) {
  const groups = buildV3OrganizerControlGroups(slug);
  return COMMON_KEYS.map(([domain, key]) => {
    const group = groups.find((candidate) => candidate.key === domain);
    return group?.items.find((candidate) => candidate.key === key)?.href ?? null;
  });
}

describe("V3 Organizer Guide canonical actions", () => {
  it("uses the permanent Organizer destination model instead of inventing another navigation system", () => {
    expect([
      v3OrganizerTabRoot("overview"),
      v3OrganizerTabRoot("tasks"),
      v3OrganizerTabRoot("control"),
      v3OrganizerTabRoot("live"),
      v3OrganizerTabRoot("more"),
    ]).toEqual([
      "/admin/operations",
      "/admin/tasks",
      "/admin/control",
      "/admin/control-room",
      "/admin/more",
    ]);

    expect(actions).toContain("v3OrganizerTabRoot(tab)");
    expect(actions).toContain("buildV3OrganizerControlGroups(editionSlug)");
    expect(actions).not.toContain('to="/confirmations/admin"');
    expect(actions).not.toContain('to="/televoting/admin"');
  });

  it("fails edition-scoped shortcuts closed until OrganizerContext has an edition slug", () => {
    expect(commonHrefs(null)).toEqual([null, null, null, null, null, null]);
    expect(commonHrefs("ssc-22")).toEqual([
      "/confirmations/admin",
      "/confirmations/admin/responses",
      "/televoting/admin",
      "/admin/results",
      "/admin/communications",
      "/admin/design/ssc-22",
    ]);

    expect(actions).toContain("useAdminContext()");
    expect(actions).toContain("Select edition");
    expect(actions).toContain('aria-disabled="true"');
  });

  it("keeps the Guide observational while making the canonical owner reachable", () => {
    expect(route).toContain("<OrganizerGuideActions />");
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(actions).not.toContain("useMutation(");
    expect(actions).not.toContain("supabase");
    expect(actions).not.toContain(".insert(");
    expect(actions).not.toContain(".update(");
    expect(actions).not.toContain(".delete(");
  });
});

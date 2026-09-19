import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Organizer rearchitecture foundation", () => {
  it("keeps the permanent Organizer navigation intentionally small", () => {
    const domains = source("src/components/admin/admin-domains.ts");
    for (const label of ["Home", "Inbox", "Rules & Cases", "Administration"]) {
      expect(domains).toContain(`label: "${label}"`);
    }
    expect(domains).toContain('id: "edition"');
    expect(domains).not.toContain('label: "Voting & Results"');
    expect(domains).not.toContain('label: "Publishing"');
  });

  it("does not count show appearances as separate edition entries", () => {
    const readiness = source("src/lib/admin-readiness.ts");
    const contest = source("src/routes/_authenticated/admin/$slug.tsx");
    expect(readiness).toContain("const canonicalEntries = participants.filter");
    expect(readiness).toContain("const logicalEntries = canonicalEntries.length");
    expect(readiness).toContain('makeArea("entries", "Entries", Math.max(logicalEntries.length, 1)');
    expect(contest).toContain('<Metric label="Entries" value={logicalEntries.length} />');
  });

  it("does not expose unpublished result placeholders in MySolaris history", () => {
    const mySolaris = source("src/routes/_authenticated/my-solaris/index.tsx");
    expect(mySolaris).toContain('import { showPublishesResults } from "@/lib/publication"');
    expect(mySolaris).toContain("const publishedResults = useMemo");
    expect(mySolaris).toContain('showPublishesResults(showById.get(row.show_id ?? ""))');
    expect(mySolaris).toContain("buildEditionProgressionPlacements(publishedResults");
  });

  it("provides an Inbox route and persistent Inbox affordance", () => {
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(inbox).toContain('createFileRoute("/_authenticated/admin/inbox")');
    expect(inbox).toContain("Needs attention");
    expect(shell).toContain('to="/admin/inbox"');
    expect(shell).toContain("unreadInboxCount");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("delegations overview confirmation triage", () => {
  it("shows the confirmation colour counts on the actual delegations overview", () => {
    const overview = source("src/routes/confirmations/admin/index.tsx");

    expect(overview).toContain('confirmationsSupabase.rpc("admin_confirmation_responses")');
    expect(overview).toContain('title="What the colours mean"');
    expect(overview).toContain("Red · Needs review");
    expect(overview).toContain("Yellow · Needs fixing");
    expect(overview).toContain("Green · Ready");
    expect(overview).toContain("No glow · Waiting");
    expect(overview).toContain("triageCounts.review");
    expect(overview).toContain("triageCounts.issue");
    expect(overview).toContain("triageCounts.ready");
    expect(overview).toContain("triageCounts.neutral");
  });

  it("uses the same core rules as the response-card triage", () => {
    const overview = source("src/routes/confirmations/admin/index.tsx");

    expect(overview).toContain('entry.review_status === "declined"');
    expect(overview).toContain('entry.review_status === "pending"');
    expect(overview).toContain('entry.review_status === "accepted"');
    expect(overview).toContain("!row.national_finals?.winning_entry_id");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../routes/_authenticated/admin/beta2-feedback.tsx", import.meta.url),
  "utf8",
);

describe("Organizer V3 Beta 2 feedback bounded-read contract", () => {
  it("reads only the fields required by the retained Beta 2 dashboard", () => {
    expect(route).toContain(
      '"id,tester_name,device,browser,familiarity,answers,bug_reports,created_at"',
    );
    expect(route).toContain(".select(BETA2_SUBMISSION_FIELDS)");
    expect(route).not.toContain('.select("*")');
  });

  it("uses a head-only count for the historical Beta 1 comparison", () => {
    expect(route).toContain(
      'select("id", { count: "exact", head: true })',
    );
  });

  it("keeps this historical QA surface read-only and explicitly refreshed", () => {
    for (const mutation of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(route).not.toContain(mutation);
    }
    for (const backgroundRefresh of ["setInterval(", "refetchInterval", ".channel("]) {
      expect(route).not.toContain(backgroundRefresh);
    }
    expect(route).toContain("onClick={() => void load()}");
  });
});
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = read("src/routes/_authenticated/admin/beta2-feedback.tsx");
const registry = read("src/lib/v3-organizer-capability-registry.ts");

describe("Organizer Beta 2 feedback query budget", () => {
  it("reads only the response fields consumed by the dashboard", () => {
    expect(route).toContain(
      '.select("id,tester_name,device,browser,familiarity,answers,bug_reports,created_at")',
    );
    expect(route).not.toContain('from("beta2_test_submissions" as never).select("*")');
  });

  it("keeps the historical feedback capability below parity until its broader O16 evidence is complete", () => {
    expect(registry).toContain('"workspace-beta-2-feedback": "contextualize"');
    expect(registry).toContain('id === "workspace-beta-2-feedback"');
  });
});

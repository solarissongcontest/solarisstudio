import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const qualityWorkflow = source(".github/workflows/ci.yml");
const migrationWorkflow = source(".github/workflows/rules-integrity-migration-rehearsal.yml");

describe("active CI branch trigger contract", () => {
  it("targets the active mainline instead of frozen forensic or historical merge branches", () => {
    const qualityTriggers = qualityWorkflow.slice(0, qualityWorkflow.indexOf("permissions:"));
    const migrationTriggers = migrationWorkflow.slice(0, migrationWorkflow.indexOf("permissions:"));

    expect(qualityTriggers).toContain("push:");
    expect(qualityTriggers).toContain("pull_request:");
    expect(qualityTriggers.match(/- main/g)?.length).toBe(2);
    expect(qualityTriggers).not.toContain("audit/pr450-base-snapshot");
    expect(qualityTriggers).not.toContain("merge/confirmations");

    expect(migrationTriggers).toContain("pull_request:");
    expect(migrationTriggers).toContain("- main");
    expect(migrationTriggers).not.toContain("audit/pr450-base-snapshot");
  });

  it("keeps Quality isolated from hosted Supabase after retiring temporary branch triggers", () => {
    expect(qualityWorkflow).toContain(
      "VITE_SUPABASE_URL=http://127.0.0.1:54321",
    );
    expect(qualityWorkflow).toContain(
      "SUPABASE_URL=http://127.0.0.1:54321",
    );
    expect(qualityWorkflow).not.toContain("https://dkxmnvekiopyesuzggeu.supabase.co");
  });
});

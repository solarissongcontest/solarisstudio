import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("Quality branch trigger contract", () => {
  it("targets the active mainline instead of frozen forensic or historical merge branches", () => {
    const triggerBlock = workflow.slice(0, workflow.indexOf("permissions:"));

    expect(triggerBlock).toContain("push:");
    expect(triggerBlock).toContain("pull_request:");
    expect(triggerBlock.match(/- main/g)?.length).toBe(2);
    expect(triggerBlock).not.toContain("audit/pr450-base-snapshot");
    expect(triggerBlock).not.toContain("merge/confirmations");
  });

  it("keeps Quality isolated from hosted Supabase after retiring temporary branch triggers", () => {
    expect(workflow).toContain(
      "VITE_SUPABASE_URL=http://127.0.0.1:54321",
    );
    expect(workflow).toContain(
      "SUPABASE_URL=http://127.0.0.1:54321",
    );
    expect(workflow).not.toContain("https://dkxmnvekiopyesuzggeu.supabase.co");
  });
});

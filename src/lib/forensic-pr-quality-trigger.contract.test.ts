import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("forensic stacked PR Quality trigger", () => {
  it("runs Quality for the isolated forensic base without weakening Supabase isolation", () => {
    expect(workflow).toContain("- audit/pr450-base-snapshot");
    expect(workflow).toContain(
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
    );
    expect(workflow).toContain(
      'SUPABASE_URL=http://127.0.0.1:54321',
    );
    expect(workflow).not.toContain("https://dkxmnvekiopyesuzggeu.supabase.co");
  });
});

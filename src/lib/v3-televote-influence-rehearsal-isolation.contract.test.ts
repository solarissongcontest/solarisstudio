import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-televote-influence-runtime-access.yml"),
  "utf8",
);
const guardSource = workflow.match(/local_db_pattern='([^']+)'/);
const localDbUrl = new RegExp(guardSource?.[1] ?? "(?!)");

describe("V3 Televote influence role rehearsal isolation", () => {
  it("runs both paths on disposable local Supabase and rejects hosted routing before SQL", () => {
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local");
    expect(guardSource).not.toBeNull();
    const guardCheck = workflow.indexOf('[[ ! "$DB_URL" =~ $local_db_pattern ]]');
    // Accept the explicit if/then variant while guarding execution order.
    const ifCheck = workflow.indexOf('if [[ ! "$DB_URL" =~ $local_db_pattern ]]; then');
    expect(guardCheck >= 0 || ifCheck >= 0).toBe(true);
    expect(Math.max(guardCheck, ifCheck)).toBeLessThan(workflow.indexOf('psql "$DB_URL"'));
  });

  it.each([
    "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
  ])("accepts only an exact isolated connection: %s", (url) => {
    expect(localDbUrl.test(url)).toBe(true);
  });

  it.each([
    "postgresql://postgres:postgres@hosted.invalid:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=hosted.invalid",
    "postgresql://postgres:postgres@localhost:54322@hosted.invalid/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/otherdb",
    "postgresql://postgres:postgres@localhost:abc/postgres",
  ])("rejects hosted/deceptive database routing: %s", (url) => {
    expect(localDbUrl.test(url)).toBe(false);
  });
});

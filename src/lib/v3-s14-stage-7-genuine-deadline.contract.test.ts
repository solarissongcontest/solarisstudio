import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stage7DeadlineAdapter = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s14-stage-7-genuine-deadline.sh"),
  "utf8",
);

describe("System V3 S14 Stage 7 genuine deadline rehearsal", () => {
  it("matches PostgreSQL boolean::text output when polling deadline expiry", () => {
    expect(stage7DeadlineAdapter).toContain(
      'select (clock_timestamp() >= closes_at)::text from televoting.rounds',
    );
    expect(stage7DeadlineAdapter).toContain('== "true"');
    expect(stage7DeadlineAdapter).not.toContain('::uuid;")" == "t"');
  });
});

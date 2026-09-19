import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public status integration", () => {
  const contest = source("src/lib/current-contest-state.ts");
  const home = source("src/components/home/CurrentContestHero.tsx");
  const edition = source("src/routes/editions/$slug.tsx");
  const confirmations = source("src/routes/confirmations/index.tsx");

  it("attaches semantic status keys to current contest state", () => {
    expect(contest).toContain("statusKey: PublicStatusKey");
    expect(contest).toContain('statusKey: "live"');
    expect(contest).toContain('statusKey: "published"');
    expect(contest).toContain('statusKey: "completed"');
  });

  it("uses the shared status renderer on major public surfaces", () => {
    expect(home).toContain("<PublicStatus");
    expect(edition).toContain("<PublicStatus");
    expect(confirmations).toContain("return <PublicStatus status={status} />");
  });
});

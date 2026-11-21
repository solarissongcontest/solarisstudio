import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("remounts the private queue for actor/edition switches and invalidates pending reads synchronously on auth events", () => {
  const source = readFileSync("src/routes/confirmations/admin/responses.tsx", "utf8");
  expect(source).toContain('key={`${actorId}:${editionId}`}');
  expect(source.indexOf("authGeneration.current += 1")).toBeLessThan(source.indexOf("setAuthEpoch((current)"));
  expect(source.match(/if \(!alive \|\| generation !== authGeneration.current\) return;/g)?.length).toBeGreaterThanOrEqual(4);
  expect(source).toContain("Ready counts, search and filters apply to this page only");
});

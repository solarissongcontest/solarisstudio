import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function between(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

describe("Results advanced-tool discovery parity", () => {
  it("keeps Broadcast Intelligence discoverable in the V3 Results projection", () => {
    const route = source("src/routes/results/index.tsx");
    const advancedTools = between(route, "advancedTools: [", "            ],");

    expect(advancedTools).toContain(
      '{ key: "broadcast", label: "Broadcast Intelligence", href: "/broadcast-intelligence" }',
    );
  });

  it("keeps Broadcast Intelligence discoverable in the installed-app fallback Results hub", () => {
    const route = source("src/routes/results/index.tsx");
    const appDestinations = between(route, "const appDestinations = [", "    ] as const;");

    expect(appDestinations).toContain('to: "/broadcast-intelligence"');
    expect(appDestinations).toContain('title: "Broadcast Intelligence"');
  });
});

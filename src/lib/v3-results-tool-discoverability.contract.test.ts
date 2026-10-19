import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = () => readFileSync(resolve(process.cwd(), "src/routes/results/index.tsx"), "utf8");

describe("V3 Results advanced-tool discoverability", () => {
  it("keeps Broadcast Intelligence discoverable in the V3 Results projection", () => {
    const source = route();

    expect(source).toContain(
      '{ key: "broadcast", label: "Broadcast Intelligence", href: "/broadcast-intelligence" }',
    );
  });

  it("keeps Broadcast Intelligence discoverable in the installed-app fallback", () => {
    const source = route();

    expect(source).toContain('to: "/broadcast-intelligence"');
    expect(source).toContain('title: "Broadcast Intelligence"');
    expect(source).toContain("Replay the published voting sequence and inspect the turning points.");
  });

  it("preserves the existing web Results discovery entry point", () => {
    const source = route();

    expect(source).toContain('to="/broadcast-intelligence"');
    expect(source).toContain('title="Replay the voting"');
  });
});

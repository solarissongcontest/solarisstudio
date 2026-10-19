import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Results Broadcast Intelligence discovery parity", () => {
  it("keeps Broadcast Intelligence discoverable in V3 app, app fallback and web Results", () => {
    const route = source("src/routes/results/index.tsx");

    expect(route).toContain(
      '{ key: "broadcast-intelligence", label: "Broadcast Intelligence", href: "/broadcast-intelligence" },',
    );
    expect(route).toContain('to: "/broadcast-intelligence",\n        title: "Broadcast Intelligence"');
    expect(route).toContain('to="/broadcast-intelligence"');
  });

  it("keeps the tool inside Results without introducing new publication authority", () => {
    const route = source("src/routes/results/index.tsx");

    expect(route).toContain("resolveShowPublication(show).results");
    expect(route).toContain("editionMap.get(show.edition_id)?.published === true");
    expect(route).not.toMatch(/broadcast-intelligence[\s\S]{0,160}(insert|update|delete|rpc\()/i);
  });
});

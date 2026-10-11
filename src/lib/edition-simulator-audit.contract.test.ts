import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Edition Simulator audit semantics", () => {
  it("keeps one canonical page heading in loading, disabled, unselected and ready states", () => {
    const simulator = source("src/routes/_authenticated/admin/edition-simulator.tsx");

    expect(simulator).toContain("function SimulatorPageHeader()");
    expect(simulator).toContain('title="Edition Simulator"');
    expect(simulator.match(/<SimulatorPageHeader \/>/g)).toHaveLength(4);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Simulation Lab audit semantics", () => {
  it("keeps one canonical page heading in loading, disabled, unselected and ready states", () => {
    const simulator = source("src/routes/_authenticated/admin/edition-simulator.tsx");

    expect(simulator).toContain("function SimulatorPageHeader()");
    expect(simulator).toContain('title="Simulation Lab"');
    expect(simulator).toContain("function SimulatorScaffold(");
    expect(simulator).toContain("<SimulatorPageHeader />");
    expect(simulator.match(/<SimulatorScaffold>/g)).toHaveLength(4);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3Foundation.tsx"), "utf8");

describe("V3 ActionCard navigation contract", () => {
  it("uses router links for canonical routes and buttons for local actions", () => {
    const components = source();

    expect(components).toContain('import { Link } from "@tanstack/react-router"');
    expect(components).toContain("to?: string");
    expect(components).toContain("<Link to={to as any}");
    expect(components).toContain('<button type="button" className="v3-action-card"');
  });

  it("does not require imperative location assignment for internal navigation", () => {
    const components = source();

    expect(components).not.toContain("window.location");
    expect(components).not.toContain("location.href");
  });
});

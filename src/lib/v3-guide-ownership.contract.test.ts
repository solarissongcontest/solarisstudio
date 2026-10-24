import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Guide ownership", () => {
  it("teaches the five canonical Public destinations and their roles", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).toContain("Home</strong>");
    expect(guide).toContain("Explore</strong>");
    expect(guide).toContain("Participate</strong>");
    expect(guide).toContain("Results</strong>");
    expect(guide).toContain("Me</strong>");
    expect(guide).toContain('to="/explore"');
    expect(guide).toContain('to="/participate"');
    expect(guide).toContain('to="/results"');
    expect(guide).toContain('to="/me"');
  });

  it("does not teach MySolaris as a separate primary destination", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).not.toContain('to="/my-solaris"');
    expect(guide).not.toContain("What is MySolaris?");
    expect(guide).not.toContain("MySolaris is your HOD home base");
    expect(guide).toContain("competing personal dashboards");
  });

  it("keeps responsibilities and personal identity in their canonical owners", () => {
    const guide = read("src/routes/guide/index.tsx");

    expect(guide).toContain("canonical place for official responsibilities");
    expect(guide).toContain("V3 home for your Solaris");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/pulse/index.tsx"), "utf8");

describe("Solaris Pulse newsroom redesign", () => {
  it("puts the most useful update structures on the page", () => {
    expect(source).toContain('eyebrow="What changed"');
    expect(source).toContain("What’s happening now");
    expect(source).toContain("Since your last visit");
    expect(source).toContain("Quick updates");
    expect(source).toContain("Numbers worth knowing");
    expect(source).toContain("Around Terra Solaris");
    expect(source).toContain("Catch me up");
  });

  it("keeps Pulse and Analysis separate", () => {
    expect(source).toContain("Pulse gives you the headline. Analysis keeps the charts");
    expect(source).toContain('to="/analysis"');
  });

  it("supports a neutral latest feed plus simple public categories", () => {
    for (const label of [
      "Latest",
      "Contest",
      "Countries",
      "Music",
      "Numbers",
      "Announcements",
    ]) {
      expect(source).toContain(`"${label}"`);
    }
  });

  it("uses readable mobile copy instead of tiny feed typography", () => {
    expect(source).not.toContain("text-[9px]");
    expect(source).not.toContain("text-[8px]");
    expect(source).toContain("line-clamp-2 text-sm leading-6");
    expect(source).toContain("overflow-x-auto");
  });

  it("adds lightweight catch-up and personalization without replacing Latest", () => {
    expect(source).toContain("solaris:pulse:last-visit");
    expect(source).toContain("Updates from things you follow");
    expect(source).toContain('feedCategory === "latest"');
    expect(source).toContain("Manage follows and update preferences");
  });
});

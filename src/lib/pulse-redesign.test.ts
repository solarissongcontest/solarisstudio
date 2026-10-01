import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/pulse/index.tsx"), "utf8");
const strip = readFileSync(resolve(process.cwd(), "src/components/PulseStrip.tsx"), "utf8");

describe("Solaris Pulse newsroom redesign", () => {
  it("keeps one catch-up hierarchy on the page", () => {
    expect(source).toContain('eyebrow="What changed"');
    expect(source).toContain(">Important<");
    expect(source).toContain("Since your last visit");
    expect(source).toContain("More updates");
    expect(source).toContain("More from Solaris");
    expect(source).toContain("Numbers worth knowing");
    expect(source).toContain("Catch me up");
    expect(source).not.toContain("What’s happening now");
    expect(source).not.toContain("Quick updates");
    expect(source).not.toContain("secondaryStories");
    expect(source).not.toContain("quickUpdates");
    expect(source).toContain("const moreUpdates = filteredEvents");
  });

  it("keeps Pulse and Analysis separate", () => {
    expect(source).toContain("Pulse gives you the headline. Analysis keeps the charts");
    expect(source).toContain('to="/analysis"');
  });

  it("supports a neutral latest feed plus the four public catch-up categories", () => {
    for (const label of ["Latest", "Contest", "Countries", "Numbers"]) {
      expect(source).toContain(`"${label}"`);
    }
    expect(source).not.toContain('["music", "Music"]');
    expect(source).not.toContain('["announcements", "Announcements"]');
  });

  it("uses readable mobile copy without a horizontally scrolling category rail", () => {
    expect(source).not.toContain("text-[9px]");
    expect(source).not.toContain("text-[8px]");
    expect(source).toContain("line-clamp-2 text-sm leading-6");
    expect(source).not.toContain("overflow-x-auto");
    expect(strip).not.toContain("text-[9px]");
    expect(strip).not.toContain("text-[8px]");
  });

  it("adds catch-up and personalization without replacing Latest", () => {
    expect(source).toContain("solaris:pulse:last-visit");
    expect(source).toContain("Updates from things you follow");
    expect(source).toContain('feedCategory === "latest"');
    expect(source).toContain("Manage follows and update preferences");
  });

  it("keeps the newer confirmations status on the homepage Pulse teaser", () => {
    expect(strip).toContain("getPublicRounds");
    expect(strip).toContain('to="/confirmations"');
    expect(strip).toContain("formatCompactCountdown");
  });
});

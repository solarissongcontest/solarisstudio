import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(
  resolve(process.cwd(), "src/components/AppShell.tsx"),
  "utf8",
);

describe("anniversary home runtime gate", () => {
  it("does not mount the heavy anniversary home takeover outside Anniversary Day", () => {
    expect(appShell).toContain("showHomeAnniversaryTakeover");
    expect(appShell).toContain("getSolarisAnniversary().active");
    expect(appShell).toContain('getAnniversaryPreviewPhase(searchStr) === "active"');
    expect(appShell).not.toContain("{isHomePage && (\n                  <Suspense fallback={null}>\n                    <LazyHomeAnniversaryTakeover");
  });

  it("keeps the explicit preview path for Organizer QA", () => {
    expect(appShell).toContain("getAnniversaryPreviewPhase");
    expect(appShell).toContain("<LazyHomeAnniversaryTakeover />");
  });
});

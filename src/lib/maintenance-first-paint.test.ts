import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

const CURRENT_STORY_FRAGMENTS = [
  "TerraOS&nbsp;3",
  "Solaris, reimagined.",
  "What matters,<br />now.",
  "More Solaris.<br />Less searching.",
  "Know exactly<br />what needs you.",
  "See what<br />happened.",
  "Your<br />Solaris.",
  'id="confirmation-access"',
] as const;

function expectMatureMaintenanceStory(html: string) {
  for (const fragment of CURRENT_STORY_FRAGMENTS) expect(html).toContain(fragment);

  expect(html).not.toContain("data-terraos-teaser-phase");
  expect(html).not.toContain("data-next-reveal");
  expect(html).not.toContain("data-teaser-locked");
  expect(html).not.toMatch(/More on (?:19|20|21)\.10/i);
  expect(html).not.toContain("Nothing new here. Yet.");
}

describe("TerraOS 3 maintenance first paint", () => {
  it.each([
    "2026-10-17T20:00:00+03:00",
    "2026-10-18T12:00:00+03:00",
    "2026-10-19T09:00:00+03:00",
    "2026-10-20T09:00:00+03:00",
    "2026-10-21T09:00:00+03:00",
    "2026-11-02T00:00:00+02:00",
  ])("ships the same mature product story at %s", (iso) => {
    expectMatureMaintenanceStory(renderMaintenancePage(new Date(iso)));
  });

  it("keeps the product story understandable when enhancement scripts are unavailable", () => {
    const html = renderMaintenancePage(new Date("2026-11-02T00:00:00+02:00"));
    const scriptless = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

    expectMatureMaintenanceStory(scriptless);
    expect(scriptless).toContain("Take a closer look.");
    expect(scriptless).toContain("Built for<br />contest night.");
    expect(scriptless).toContain("Your delegation<br />keeps moving.");
  });

  it("detects a regression that reintroduces an historical reveal gate", () => {
    const html = renderMaintenancePage(new Date("2026-11-02T00:00:00+02:00"));
    const historicallyGated = html.replace(
      '<main class="product-story"',
      '<main data-terraos-teaser-phase="launch-day" class="product-story"',
    );

    expect(() => expectMatureMaintenanceStory(historicallyGated)).toThrow();
  });
});

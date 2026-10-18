import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

describe("TerraOS 3 progressive reveal rendering", () => {
  it("renders only the 18 October material and one next-reveal marker before 19 October", () => {
    const teaser = renderMaintenancePage(new Date("2026-10-18T13:00:00+03:00"));

    expect(teaser).toContain('data-terraos-teaser-phase="0"');
    expect(teaser).toContain("Take a closer look.");
    expect(teaser).toContain("Five places.<br />One Solaris.");
    expect(teaser).toContain('data-next-reveal="2026-10-19"');
    expect(teaser).toContain("More on 19.10");

    expect(teaser).not.toContain('id="liquid-demo"');
    expect(teaser).not.toContain("What’s next,<br />at a glance.");
    expect(teaser).not.toContain("Results, live.");
    expect(teaser).not.toContain("More on 20.10");
    expect(teaser).not.toContain("More on 21.10");
    expect(teaser).not.toContain("class=\"gate\"");
    expect(teaser).not.toContain("data-locked-copy");
  });

  it("adds navigation on 19 October without rendering later-day placeholders", () => {
    const teaser = renderMaintenancePage(new Date("2026-10-19T00:01:00+03:00"));

    expect(teaser).toContain('data-terraos-teaser-phase="1"');
    expect(teaser).toContain('id="liquid-demo"');
    expect(teaser).toContain("Touch it.");
    expect(teaser).toContain('data-next-reveal="2026-10-20"');
    expect(teaser).not.toContain("What’s next,<br />at a glance.");
    expect(teaser).not.toContain("Results, live.");
  });

  it("adds Participation on 20 October and Results on 21 October", () => {
    const twenty = renderMaintenancePage(new Date("2026-10-20T00:01:00+03:00"));
    expect(twenty).toContain('data-terraos-teaser-phase="2"');
    expect(twenty).toContain("What’s next,<br />at a glance.");
    expect(twenty).toContain('data-next-reveal="2026-10-21"');
    expect(twenty).not.toContain("Results, live.");

    const twentyOne = renderMaintenancePage(new Date("2026-10-21T00:01:00+03:00"));
    expect(twentyOne).toContain('data-terraos-teaser-phase="3"');
    expect(twentyOne).toContain("Results, live.");
    expect(twentyOne).toContain("Combined");
    expect(twentyOne).not.toContain("data-next-reveal=");
  });
});

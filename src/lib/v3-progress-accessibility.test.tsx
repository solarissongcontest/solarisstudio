import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { V3Progress } from "@/components/v3/V3Foundation";

describe("V3 shared progress accessibility", () => {
  it("exposes a finite labelled percentage for ordinary progress", () => {
    const html = renderToStaticMarkup(<V3Progress value={24.6} label="Jury votes" />);
    expect(html).toContain("Jury votes");
    expect(html).toContain("25%");
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('data-state="known"');
    expect(html).toContain('width:24.6%');
  });

  it("clamps out-of-range known values without changing their meaning to unknown", () => {
    const negative = renderToStaticMarkup(<V3Progress value={-20} label="Uploads" />);
    const complete = renderToStaticMarkup(<V3Progress value={220} label="Uploads" />);

    expect(negative).toContain('aria-valuenow="0"');
    expect(negative).toContain("0%");
    expect(complete).toContain('aria-valuenow="100"');
    expect(complete).toContain("100%");
    expect(negative).not.toContain("Unavailable");
    expect(complete).not.toContain("Unavailable");
  });

  it.each([NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "shows unavailable instead of a false zero or invalid accessible value (%s)",
    (value) => {
      const html = renderToStaticMarkup(<V3Progress value={value} label="Results ready" />);

      expect(html).toContain("Results ready");
      expect(html).toContain("Unavailable");
      expect(html).toContain('aria-valuetext="Progress unavailable"');
      expect(html).toContain('data-state="unavailable"');
      expect(html).not.toContain("aria-valuenow=");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
    },
  );

  it("makes unavailable progress visible and labelled even without an optional label", () => {
    const html = renderToStaticMarkup(<V3Progress value={NaN} />);
    expect(html).toContain(">Progress</span>");
    expect(html).toContain(">Unavailable</span>");
    expect(html).toContain('aria-label="Progress"');
    expect(html).not.toContain("aria-valuenow=");
  });
});

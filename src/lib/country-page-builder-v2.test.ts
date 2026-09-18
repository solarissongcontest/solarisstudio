import { describe, expect, it } from "vitest";

import { countrySectionPresentation } from "@/lib/country-page-builder";

describe("Country Design V2 section layout inheritance", () => {
  it("inherits the page default when a section has no explicit layouts", () => {
    const presentation = countrySectionPresentation({}, "magazine");
    expect(presentation.countryLayout).toBe("magazine");
    expect(presentation.wikiLayout).toBe("magazine");
    expect(presentation.layoutVariant).toBe("magazine");
  });

  it("keeps explicit Country and Wiki overrides independent", () => {
    const presentation = countrySectionPresentation(
      { countryLayout: "dashboard", wikiLayout: "encyclopedia" },
      "magazine",
    );
    expect(presentation.countryLayout).toBe("dashboard");
    expect(presentation.wikiLayout).toBe("encyclopedia");
  });

  it("uses legacy layoutVariant as the shared override when present", () => {
    const presentation = countrySectionPresentation({ layoutVariant: "timeline" }, "showcase");
    expect(presentation.countryLayout).toBe("timeline");
    expect(presentation.wikiLayout).toBe("timeline");
  });
});

import { describe, expect, it } from "vitest";

import {
  ORGANIZER_ANNIVERSARY_PREVIEWS,
  ORGANIZER_ANNIVERSARY_REQUIRED_PREVIEW_HREFS,
  organizerAnniversaryRequiredPreviews,
} from "./v3-organizer-anniversary-preview";

describe("Organizer Anniversary preview coverage", () => {
  it("covers every repository-required Anniversary Day launch surface", () => {
    const requiredHrefs = organizerAnniversaryRequiredPreviews().map((preview) => preview.href);
    expect(requiredHrefs).toEqual(expect.arrayContaining([...ORGANIZER_ANNIVERSARY_REQUIRED_PREVIEW_HREFS]));
    expect(requiredHrefs).toHaveLength(ORGANIZER_ANNIVERSARY_REQUIRED_PREVIEW_HREFS.length);
  });

  it("keeps preview destinations unique", () => {
    const hrefs = ORGANIZER_ANNIVERSARY_PREVIEWS.map((preview) => preview.href);
    expect(new Set(hrefs).size).toEqual(hrefs.length);
  });

  it("retains the countdown as an additional deterministic preview without treating it as launch coverage", () => {
    expect(ORGANIZER_ANNIVERSARY_PREVIEWS).toContainEqual(
      expect.objectContaining({ href: "/?anniversary=countdown", requiredForLaunch: false }),
    );
  });

  it("includes Archive Games in the required launch set", () => {
    expect(organizerAnniversaryRequiredPreviews()).toContainEqual(
      expect.objectContaining({ href: "/archive-games?anniversary=active", requiredForLaunch: true }),
    );
  });
});

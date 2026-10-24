import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("edition date discoverability", () => {
  const editionsRoute = source("routes/_authenticated/admin/editions.tsx");
  const editions = source("components/admin/AllEditionsWorkspaceV3.tsx");
  const administration = source("routes/_authenticated/admin/more.tsx");
  const dateEditor = source("routes/_authenticated/admin/anniversary-dates.tsx");

  it("keeps the Editions route bound to the governed workspace", () => {
    expect(editionsRoute).toContain("AllEditionsWorkspaceV3");
  });

  it("links to the date editor directly from the Editions workspace", () => {
    expect(editions).toContain('to="/admin/anniversary-dates"');
    expect(editions).toContain("Edition dates");
  });

  it("keeps Edition dates discoverable from Administration", () => {
    expect(administration).toContain('label: "Edition dates"');
    expect(administration).toContain('to: "/admin/anniversary-dates"');
  });

  it("offers an edition-specific historical date shortcut", () => {
    expect(editions).toContain("Edit historical date");
    expect(editions).toContain("search={{ edition: edition.id }}");
    expect(dateEditor).toContain("validateSearch");
    expect(dateEditor).toContain('edition-date-${edition.id}');
    expect(dateEditor).toContain("scrollIntoView");
  });
});

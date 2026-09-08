import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("confirmed-country sync discoverability", () => {
  it("links the show sync manager from the Contest workflow", () => {
    const editionAdmin = source("routes/_authenticated/admin/$slug.tsx");
    expect(editionAdmin).toContain('title="Sync confirmed countries"');
    expect(editionAdmin).toContain('to={`/admin/lineup-sync/${slug}`}');
  });

  it("keeps round-to-show sync available from Delegations advanced tools", () => {
    const delegationsAdmin = source("routes/confirmations/admin/index.tsx");
    expect(delegationsAdmin).toContain('to="/confirmations/admin/sync"');
    expect(delegationsAdmin).toContain('title="Sync to contest"');
  });

  it("uses explicit confirmed-country wording in the show manager", () => {
    const manager = source("routes/_authenticated/admin/lineup-sync/$slug.tsx");
    expect(manager).toContain('title="Sync confirmed countries to shows"');
    expect(manager).toContain("Add all ${missing.length} confirmed countries");
    expect(manager).toContain('to="/confirmations/admin/sync"');
  });
});

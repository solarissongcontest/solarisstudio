import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const context = source("src/components/mysolaris/MySolarisContext.tsx");
const loader = source("src/lib/my-solaris-data.ts");

describe("MySolaris bounded data access", () => {
  it("does not load the complete participant archive for the signed-in country", () => {
    expect(context).not.toContain("useAllParticipants");
    expect(context).toContain("loadMySolarisParticipant");
  });

  it("scopes the current participant query by edition, country and edition-level row", () => {
    expect(loader).toContain('.eq("edition_id", editionId)');
    expect(loader).toContain('.eq("country_id", countryId)');
    expect(loader).toContain('.is("show_id", null)');
    expect(loader).not.toContain('.select("*")');
  });
});
